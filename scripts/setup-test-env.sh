#!/bin/bash

# ContentStageEngine Test Environment Setup Script
# This script sets up the test environment for the ContentStageEngine project

echo "🚀 Setting up ContentStageEngine test environment..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create test directories
echo "📁 Creating test directories..."
mkdir -p temp-test-files
mkdir -p uploads/test
mkdir -p logs

# Set up environment variables for testing
echo "🔧 Setting up environment variables..."

# Database configuration
export DATABASE_URL="${DATABASE_URL:-postgres://test:test@localhost:5432/test}"
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-$DATABASE_URL}"
export TEST_DB_TYPE="postgres"
echo "✅ Using PostgreSQL for testing"

# API Keys for testing (you can override these with real keys)
export OPENAI_API_KEY="${OPENAI_API_KEY:-test-openai-key}"
export ASSEMBLY_AI_API_KEY="${ASSEMBLY_AI_API_KEY:-test-assembly-ai-key}"
export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-test-stripe-key}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

# Replit environment variables for testing
export REPLIT_DOMAINS="${REPLIT_DOMAINS:-test.replit.com}"
export REPLIT_CLIENT_ID="${REPLIT_CLIENT_ID:-test-client-id}"
export REPLIT_CLIENT_SECRET="${REPLIT_CLIENT_SECRET:-test-client-secret}"
export REPLIT_DB_URL="${REPLIT_DB_URL:-$DATABASE_URL}"

# Additional test environment variables
export PORT="${PORT:-5000}"
export HOST="${HOST:-localhost}"
export SESSION_SECRET="${SESSION_SECRET:-test-session-secret}"
export CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:3000}"
export NODE_ENV="test"

# Create .env.test file
cat > .env.test << EOF
# Test Environment Configuration
NODE_ENV=test
DATABASE_URL=$DATABASE_URL
TEST_DATABASE_URL=$TEST_DATABASE_URL
TEST_DB_TYPE=$TEST_DB_TYPE

# API Keys
OPENAI_API_KEY=$OPENAI_API_KEY
ASSEMBLY_AI_API_KEY=$ASSEMBLY_AI_API_KEY
STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY
REDIS_URL=$REDIS_URL

# Replit Configuration
REPLIT_DOMAINS=$REPLIT_DOMAINS
REPLIT_CLIENT_ID=$REPLIT_CLIENT_ID
REPLIT_CLIENT_SECRET=$REPLIT_CLIENT_SECRET
REPLIT_DB_URL=$REPLIT_DB_URL

# Server Configuration
PORT=$PORT
HOST=$HOST
SESSION_SECRET=$SESSION_SECRET
CORS_ORIGIN=$CORS_ORIGIN
EOF

echo "✅ Created .env.test file"

# Check if PostgreSQL is available
echo "🔍 Checking PostgreSQL connection..."
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL client found"
else
    echo "⚠️  PostgreSQL client not found. Please install PostgreSQL or ensure your DATABASE_URL points to a valid PostgreSQL instance."
fi

# Run database migrations if needed
echo "🗄️  Setting up database..."
if [ -f "drizzle.config.ts" ]; then
    echo "✅ Drizzle config found"
    # Note: You may need to run migrations manually depending on your setup
    echo "📝 Note: Run 'npx drizzle-kit push' to apply database migrations"
else
    echo "⚠️  Drizzle config not found"
fi

# Create test data directory
echo "📁 Creating test data directory..."
mkdir -p test-data

# Set up test files
echo "📄 Creating test files..."
if [ ! -f "test_audio.wav" ]; then
    echo "⚠️  test_audio.wav not found. Some audio tests may fail."
fi

# Set permissions
echo "🔐 Setting file permissions..."
chmod 755 temp-test-files
chmod 755 uploads/test
chmod 644 .env.test

echo ""
echo "🎉 Test environment setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Ensure PostgreSQL is running and accessible"
echo "2. Run 'npx drizzle-kit push' to apply database migrations"
echo "3. Run 'npm test' to run the test suite"
echo ""
echo "🔧 Environment variables are set in .env.test"
echo "📁 Test directories created: temp-test-files, uploads/test, logs"
echo ""
echo "✅ Ready for testing!" 