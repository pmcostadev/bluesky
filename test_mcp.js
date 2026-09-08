/**
 * Bluesky MCP Server - Test Client
 * Tests MCP server functionality
 */

import { randomUUID } from 'crypto';

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const MCP_ENDPOINT = `${SERVER_URL}/mcp`;
const HEALTH_ENDPOINT = `${SERVER_URL}/health`;

// Test credentials (use environment variables for actual tests)
const TEST_IDENTIFIER = process.env.BLUESKY_IDENTIFIER;
const TEST_PASSWORD = process.env.BLUESKY_APP_PASSWORD;

/**
 * Make an MCP request
 */
async function mcpRequest(method: string, params?: Record<string, unknown>, id = 1) {
  const response = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(TEST_IDENTIFIER && TEST_PASSWORD ? {
        'x-bluesky-identifier': TEST_IDENTIFIER,
        'x-bluesky-password': TEST_PASSWORD
      } : {})
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: params || {}
    })
  });

  return response.json();
}

/**
 * Health check test
 */
async function testHealth() {
  console.log('\n=== Testing Health Endpoint ===');
  try {
    const response = await fetch(HEALTH_ENDPOINT);
    const data = await response.json();
    console.log('Health check:', data);
    return response.ok;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

/**
 * Test list tools
 */
async function testListTools() {
  console.log('\n=== Testing List Tools ===');
  try {
    const result = await mcpRequest('tools/list');
    console.log('Available tools:', result.result?.tools?.map((t: { name: string }) => t.name) || []);
    return true;
  } catch (error) {
    console.error('List tools failed:', error);
    return false;
  }
}

/**
 * Test tool call - search posts
 */
async function testSearchPosts() {
  console.log('\n=== Testing Search Posts ===');
  try {
    const result = await mcpRequest('tools/call', {
      name: 'search_posts',
      arguments: {
        query: 'bluesky social',
        limit: 5
      }
    });
    console.log('Search posts result:', JSON.stringify(result, null, 2));
    return true;
  } catch (error) {
    console.error('Search posts failed:', error);
    return false;
  }
}

/**
 * Test tool call - search actors
 */
async function testSearchActors() {
  console.log('\n=== Testing Search Actors ===');
  try {
    const result = await mcpRequest('tools/call', {
      name: 'search_actors',
      arguments: {
        term: 'bluesky',
        limit: 5
      }
    });
    console.log('Search actors result:', JSON.stringify(result, null, 2));
    return true;
  } catch (error) {
    console.error('Search actors failed:', error);
    return false;
  }
}

/**
 * Test tool call - get profile
 */
async function testGetProfile() {
  console.log('\n=== Testing Get Profile ===');
  try {
    const result = await mcpRequest('tools/call', {
      name: 'get_profile',
      arguments: {
        actor: 'bluesky.social'
      }
    });
    console.log('Get profile result:', JSON.stringify(result, null, 2));
    return true;
  } catch (error) {
    console.error('Get profile failed:', error);
    return false;
  }
}

/**
 * Test tool call - test connectivity
 */
async function testConnectivity() {
  console.log('\n=== Testing Connectivity ===');
  try {
    const result = await mcpRequest('tools/call', {
      name: 'test_connectivity',
      arguments: {}
    });
    console.log('Connectivity result:', JSON.stringify(result, null, 2));
    return true;
  } catch (error) {
    console.error('Connectivity test failed:', error);
    return false;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('===========================================');
  console.log('Bluesky MCP Server - Test Suite');
  console.log('===========================================');
  console.log(`Server URL: ${SERVER_URL}`);
  console.log(`MCP Endpoint: ${MCP_ENDPOINT}`);
  console.log(`Has credentials: ${!!(TEST_IDENTIFIER && TEST_PASSWORD)}`);

  const results: Record<string, boolean> = {};

  results.health = await testHealth();
  results.listTools = await testListTools();
  results.connectivity = await testConnectivity();
  results.searchPosts = await testSearchPosts();
  results.searchActors = await testSearchActors();
  results.getProfile = await testGetProfile();

  console.log('\n===========================================');
  console.log('Test Results Summary');
  console.log('===========================================');
  for (const [test, passed] of Object.entries(results)) {
    console.log(`${passed ? '✓' : '✗'} ${test}`);
  }

  const allPassed = Object.values(results).every(r => r);
  console.log(`\nOverall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);

  process.exit(allPassed ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});