#!/bin/bash
# Bluesky MCP Server - Endpoint Test Script

# Configuration
SERVER_URL="${SERVER_URL:-http://localhost:3000}"
MCP_ENDPOINT="${SERVER_URL}/mcp"
HEALTH_ENDPOINT="${SERVER_URL}/health"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "==========================================="
echo "Bluesky MCP Server - Endpoint Tests"
echo "==========================================="
echo "Server URL: $SERVER_URL"
echo "MCP Endpoint: $MCP_ENDPOINT"
echo ""

# Function to check if endpoint is reachable
test_endpoint() {
    local endpoint=$1
    local name=$2
    echo -n "Testing $name... "
    if curl -s -o /dev/null -w "%{http_code}" "$endpoint" | grep -q "200\|503"; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        return 1
    fi
}

# Function to test MCP initialize
test_mcp_initialize() {
    echo -n "Testing MCP Initialize... "
    local response=$(curl -s -X POST "$MCP_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d '{
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {
                    "name": "test-client",
                    "version": "1.0.0"
                }
            }
        }')

    if echo "$response" | grep -q "result"; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        echo "Response: $response"
        return 1
    fi
}

# Function to test MCP list tools
test_mcp_list_tools() {
    echo -n "Testing MCP List Tools... "
    local response=$(curl -s -X POST "$MCP_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d '{
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }')

    if echo "$response" | grep -q "tools"; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        echo "Response: $response"
        return 1
    fi
}

# Function to test MCP call tool (search_posts)
test_mcp_search_posts() {
    echo -n "Testing MCP Call (search_posts)... "
    local response=$(curl -s -X POST "$MCP_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d '{
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "search_posts",
                "arguments": {
                    "query": "bluesky",
                    "limit": 3
                }
            }
        }')

    if echo "$response" | grep -q "success"; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        echo "Response: $response"
        return 1
    fi
}

# Function to test search endpoint
test_search_endpoint() {
    echo -n "Testing Search REST API... "
    local response=$(curl -s "${SERVER_URL}/api/search/posts?q=bluesky&limit=3")
    if echo "$response" | grep -q "success"; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        return 1
    fi
}

# Run all tests
results=0

echo "==========================================="
echo "Endpoint Tests"
echo "==========================================="
test_endpoint "$HEALTH_ENDPOINT" "Health Check" || results=$((results + 1))
test_endpoint "$MCP_ENDPOINT" "MCP Endpoint" || results=$((results + 1))

echo ""
echo "==========================================="
echo "MCP Protocol Tests"
echo "==========================================="
test_mcp_initialize || results=$((results + 1))
test_mcp_list_tools || results=$((results + 1))
test_mcp_search_posts || results=$((results + 1))

echo ""
echo "==========================================="
echo "REST API Tests"
echo "==========================================="
test_search_endpoint || results=$((results + 1))

echo ""
echo "==========================================="
echo "Summary"
echo "==========================================="
if [ $results -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}$results test(s) failed${NC}"
    exit 1
fi