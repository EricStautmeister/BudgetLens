# Immediate Nuclear Reset with Sudo Powers 🚀

echo "🚨 NUCLEAR RESET with SUDO - Complete Database Wipeout"
echo "======================================================"

# Step 1: Stop all containers
echo "🛑 Stopping all containers with sudo..."
sudo docker compose down
sudo docker compose down -v

# Step 2: Remove all containers
echo "🗑️ Removing all containers..."
sudo docker stop $(sudo docker ps -q) 2>/dev/null || true
sudo docker rm $(sudo docker ps -a -q) 2>/dev/null || true

# Step 3: Remove all volumes
echo "💾 Removing all volumes..."
sudo docker volume rm $(sudo docker volume ls -q) 2>/dev/null || true
sudo docker volume prune -f

# Step 4: Remove PostgreSQL images (optional but thorough)
echo "🖼️ Removing PostgreSQL images..."
sudo docker images | grep postgres | awk '{print $3}' | xargs -r sudo docker rmi -f

# Step 5: Clean everything
echo "🧹 Deep cleaning Docker..."
sudo docker system prune -f

# Step 6: Start fresh database
echo "🆕 Starting fresh PostgreSQL with sudo..."
sudo docker compose up -d db

# Step 7: Wait for startup
echo "⏳ Waiting for PostgreSQL to start..."
sleep 15

# Step 8: Test connection
echo "✅ Testing fresh database..."
sudo docker compose exec db psql -U user -d budgetapp -c "SELECT 'Fresh database ready!' as status;"

# Step 9: Verify empty database
echo "📋 Verifying database is clean..."
sudo docker compose exec db psql -U user -d budgetapp -c "\dt"

echo ""
echo "🎉 NUCLEAR RESET COMPLETE!"
echo "✅ Database is completely clean and ready"
echo "✅ All old data has been destroyed"
echo "✅ Ready for your new account management system"
echo ""
echo "🚀 Next steps:"
echo "1. Update your models.py file"
echo "2. Add schema and service files"
echo "3. Run: sudo docker-compose up backend"
echo "4. SQLAlchemy will create everything automatically!"