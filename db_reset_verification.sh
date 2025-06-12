# Reset Verification Script
# Run this to verify your reset was successful

echo "🔍 VERIFICATION: Checking PostgreSQL Reset Status"
echo "=================================================="

# Check Docker containers
echo "📦 Docker Containers:"
sudo docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
echo ""

# Check Docker volumes
echo "💾 Docker Volumes:"
sudo docker volume ls --format "table {{.Name}}\t{{.Driver}}"
echo ""

# Check if database is accessible
echo "🗄️ Database Connectivity:"
if sudo sudo docker compose exec db psql -U user -d budgetapp -c "SELECT 'Connected successfully!' as status;" 2>/dev/null; then
    echo "✅ Database connection: SUCCESS"
else
    echo "❌ Database connection: FAILED"
    echo "Try: sudo sudo docker compose up -d db"
fi
echo ""

# Check database contents
echo "📋 Database Contents:"
echo "--- Databases ---"
sudo docker compose exec db psql -U user -d postgres -c "\l" 2>/dev/null | grep budgetapp || echo "❌ budgetapp database not found"

echo "--- Tables ---"
TABLES=$(sudo docker compose exec db psql -U user -d budgetapp -c "\dt" 2>/dev/null)
if echo "$TABLES" | grep -q "No relations found"; then
    echo "✅ Database is clean (no tables)"
elif echo "$TABLES" | grep -q "List of relations"; then
    echo "⚠️ Database has existing tables:"
    echo "$TABLES"
else
    echo "❌ Could not check tables"
fi

echo "--- Users ---"
sudo docker compose exec db psql -U user -d budgetapp -c "\du" 2>/dev/null | head -10

echo ""
echo "🎯 RESET STATUS:"
if sudo docker compose exec db psql -U user -d budgetapp -c "\dt" 2>/dev/null | grep -q "No relations found"; then
    echo "✅ SUCCESS: Database is completely clean and ready!"
    echo "✅ Next step: Update your models and start the backend"
else
    echo "⚠️ WARNING: Database may still have data"
    echo "⚠️ Consider running the reset script again"
fi

echo ""
echo "🚀 Ready for next steps:"
echo "1. Update backend/app/db/models.py with new account models"
echo "2. Add schema files (account.py, transfer.py)"
echo "3. Add service files (account.py, transfer.py)"
echo "4. Run: sudo docker compose up backend"
echo "5. SQLAlchemy will create all tables automatically!"