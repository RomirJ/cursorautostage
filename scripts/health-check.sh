#!/bin/bash

# Health check script for ContentStageEngine

BASE_URL=${1:-"http://localhost:3000"}

echo "🏥 Health Check for ContentStageEngine"
echo "====================================="

# Test basic API
echo "Testing API endpoint..."
if curl -s "$BASE_URL/api/test" > /dev/null; then
    echo "✅ API is responding"
else
    echo "❌ API is not responding"
    exit 1
fi

# Test upload endpoint
echo "Testing upload endpoint..."
if curl -s -X POST "$BASE_URL/api/test-upload" > /dev/null; then
    echo "✅ Upload endpoint is available"
else
    echo "❌ Upload endpoint is not available"
fi

echo "🏥 Health check completed"
