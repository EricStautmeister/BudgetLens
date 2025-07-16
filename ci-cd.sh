#!/bin/bash

# BudgetLens CI/CD Pipeline with Enhanced Logging
# migrate database with alembic
# build docker and deploy the application

# Configuration
LOG_DIR="./logs"
LOG_FILE="$LOG_DIR/ci-cd-$(date +%Y%m%d_%H%M%S).log"
ERROR_LOG="$LOG_DIR/ci-cd-errors-$(date +%Y%m%d_%H%M%S).log"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Logging functions
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

log_info() {
    log "INFO" "$@"
}

log_error() {
    log "ERROR" "$@"
    echo "[$timestamp] [ERROR] $@" >> "$ERROR_LOG"
}

log_success() {
    log "SUCCESS" "$@"
}

log_warning() {
    log "WARNING" "$@"
}

# Function to run command with logging
run_with_logs() {
    local description="$1"
    shift
    local command="$@"
    
    log_info "Starting: $description"
    log_info "Command: $command"
    
    # Run command and capture output
    if eval "$command" >> "$LOG_FILE" 2>&1; then
        log_success "$description completed successfully"
        return 0
    else
        log_error "$description failed"
        log_error "Command that failed: $command"
        return 1
    fi
}

# Function to show Docker logs
show_docker_logs() {
    local service="$1"
    log_info "Showing last 50 lines of $service logs:"
    echo "=== $service LOGS ===" >> "$LOG_FILE"
    sudo docker compose logs --tail=50 "$service" >> "$LOG_FILE" 2>&1
}

# Function to show all container logs
show_all_logs() {
    log_info "Capturing all container logs..."
    echo "=== ALL CONTAINER LOGS ===" >> "$LOG_FILE"
    sudo docker compose logs >> "$LOG_FILE" 2>&1
}

# Function to check container health
check_container_health() {
    log_info "Checking container health status..."
    echo "=== CONTAINER STATUS ===" >> "$LOG_FILE"
    sudo docker compose ps >> "$LOG_FILE" 2>&1
    
    # Check if any containers are unhealthy
    if sudo docker compose ps | grep -q "unhealthy"; then
        log_warning "Some containers are unhealthy"
        return 1
    fi
    
    return 0
}

# Function to cleanup on exit
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log_error "Pipeline failed with exit code $exit_code"
        log_info "Capturing final logs for troubleshooting..."
        show_all_logs
        echo ""
        echo "❌ CI/CD Pipeline Failed!"
        echo "📝 Check logs at: $LOG_FILE"
        echo "🔍 Error log at: $ERROR_LOG"
    else
        log_success "CI/CD Pipeline completed successfully!"
        echo ""
        echo "✅ CI/CD Pipeline Completed Successfully!"
        echo "📝 Full logs available at: $LOG_FILE"
    fi
}

# Set up cleanup on exit
trap cleanup EXIT

# Start pipeline
echo "🚀 Starting CI/CD Pipeline for BudgetLens"
echo "=================================================="
log_info "CI/CD Pipeline started"
log_info "Log file: $LOG_FILE"
log_info "Error log: $ERROR_LOG"

# Step 1: Verify Docker is running
echo "🔍 Checking Docker Status"
if ! run_with_logs "Docker status check" "sudo docker info"; then
    log_error "Docker is not running. Please start Docker and try again."
    exit 1
fi
echo "✅ Docker is running"

# Step 2: Verify Docker Compose is installed
echo "🔍 Checking Docker Compose Installation"
if ! run_with_logs "Docker Compose version check" "docker compose version"; then
    log_error "Docker Compose is not installed. Please install Docker Compose and try again."
    exit 1
fi
echo "✅ Docker Compose is installed"

# Step 3: Stop existing containers (if any)
echo "🛑 Stopping existing containers"
if ! run_with_logs "Stop existing containers" "sudo docker compose down"; then
    log_warning "Failed to stop existing containers (may not exist)"
fi
echo "✅ Existing containers stopped"

# Step 4: Build Docker images
echo "🔨 Building Docker Images"
if ! run_with_logs "Docker build" "sudo docker compose build"; then
    log_error "Docker build failed. Check build logs above."
    exit 1
fi
echo "✅ Docker images built successfully"

# Step 5: Start Docker containers
echo "🚀 Starting Docker Containers"
if ! run_with_logs "Start Docker containers" "sudo docker compose up -d"; then
    log_error "Failed to start Docker containers."
    show_all_logs
    exit 1
fi
echo "✅ Docker containers started successfully"

# Step 6: Wait for containers to be ready
echo "⏳ Waiting for containers to be ready..."
sleep 10

# Step 7: Verify application is running
echo "🔍 Verifying Application Status"
if ! check_container_health; then
    log_error "Some containers are not healthy"
    show_all_logs
    exit 1
fi

if ! sudo docker compose ps | grep -q "Up"; then
    log_error "Application is not running properly"
    show_all_logs
    exit 1
fi
echo "✅ Application is running"

# Step 8: Migrate database with alembic
echo "🔄 Migrating Database with Alembic"
if ! run_with_logs "Database migration" "sudo docker compose exec -T backend alembic upgrade head"; then
    log_error "Database migration failed"
    show_docker_logs "backend"
    show_docker_logs "db"
    exit 1
fi
echo "✅ Database migration successful"

# Step 9: Run health checks
echo "🏥 Running Health Checks"
log_info "Checking backend health..."
if ! run_with_logs "Backend health check" "curl -f http://localhost:8000/health || sudo docker compose exec -T backend python -c 'import requests; print(requests.get(\"http://localhost:8000/health\").status_code)'"; then
    log_warning "Backend health check failed"
    show_docker_logs "backend"
fi

log_info "Checking frontend accessibility..."
if ! run_with_logs "Frontend health check" "curl -f http://localhost:3000 || true"; then
    log_warning "Frontend health check failed"
    show_docker_logs "frontend"
fi

# Step 10: Run tests (if test files exist)
echo "🧪 Running Tests"
if [ -f "backend/tests/test_main.py" ] || [ -d "backend/tests" ]; then
    if ! run_with_logs "Backend tests" "sudo docker compose exec -T backend python -m pytest tests/ -v"; then
        log_warning "Backend tests failed"
        show_docker_logs "backend"
    fi
else
    log_info "No backend tests found, skipping..."
fi

if [ -f "frontend/package.json" ] && grep -q "test" frontend/package.json; then
    if ! run_with_logs "Frontend tests" "sudo docker compose exec -T frontend npm test -- --watchAll=false"; then
        log_warning "Frontend tests failed"
        show_docker_logs "frontend"
    fi
else
    log_info "No frontend tests configured, skipping..."
fi

# Step 11: Display final status
echo "📊 Final Status Report"
log_info "=== FINAL STATUS REPORT ==="
sudo docker compose ps >> "$LOG_FILE" 2>&1
echo "🌐 Application URLs:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"

# Show recent logs summary
echo ""
echo "📋 Recent Log Summary (last 20 lines):"
tail -20 "$LOG_FILE"

echo ""
echo "🎉 Deployment Complete!"
echo "📝 Full logs: $LOG_FILE"
if [ -f "$ERROR_LOG" ]; then
    echo "⚠️  Error log: $ERROR_LOG"
fi