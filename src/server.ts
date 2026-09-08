/**
 * Express Server for Local Development
 * Production uses Vercel serverless functions (api/*)
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMCPServer } from './mcp-server';
import { securityHeadersMiddleware, rateLimitMiddleware, writeRateLimitMiddleware, corsOptions } from './middleware';
import { sanitizeString, validatePostText } from './sanitize';
import { formatError } from './utils';
import { BlueskyClient } from './bluesky-client';

const app = express();
const PORT = parseInt(process.env.PORT || '8000', 10);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors(corsOptions()));
app.use(securityHeadersMiddleware);
app.use(rateLimitMiddleware);

// Store for active MCP transports
const activeTransports = new Map<string, StreamableHTTPServerTransport>();

/**
 * MCP endpoint - handles MCP protocol over Streamable HTTP
 */
app.post('/mcp', async (req, res) => {
  try {
    // Check for write operations - apply stricter rate limit
    const body = req.body;
    if (body?.method === 'tools/call' && body?.params?.name === 'create_post') {
      // Write rate limit applied automatically via middleware
    }

    // Create fresh server instance for stateless operation
    const server = createMCPServer();

    // Create transport
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID()
    });

    // Connect server to transport
    await server.connect(transport);

    // Store transport for session management
    const sessionId = req.headers['mcp-session-id'] as string;
    if (sessionId) {
      activeTransports.set(sessionId, transport);
    }

    // Handle request
    const response = await transport.handleRequest(req, res, body);

    // Clean up session
    if (sessionId) {
      activeTransports.delete(sessionId);
    }
  } catch (error) {
    console.error('MCP POST error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error'
      },
      id: null
    });
  }
});

/**
 * MCP SSE endpoint for server-initiated messages
 */
app.get('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string;

    // Check for existing session
    if (sessionId && activeTransports.has(sessionId)) {
      const transport = activeTransports.get(sessionId)!;
      await transport.handleRequest(req, res, null);
      return;
    }

    // Create new session
    const server = createMCPServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID()
    });

    await server.connect(transport);

    const newSessionId = transport.sessionId;
    if (newSessionId) {
      activeTransports.set(newSessionId, transport);
    }

    await transport.handleRequest(req, res, null);
  } catch (error) {
    console.error('MCP GET error:', error);
    res.status(500).end();
  }
});

/**
 * MCP DELETE endpoint for session termination
 */
app.delete('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;

  if (sessionId && activeTransports.has(sessionId)) {
    const transport = activeTransports.get(sessionId)!;
    transport.handleRequest(req, res, null).catch(console.error);
    activeTransports.delete(sessionId);
  }

  res.status(204).end();
});

/**
 * Health check endpoint
 */
app.get('/health', async (_req, res) => {
  const client = new BlueskyClient();

  try {
    const connectivity = await client.testConnectivity();
    const sessionInfo = client.getSessionInfo();

    res.json({
      status: connectivity.connected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      service: 'bluesky-mcp',
      bluesky: {
        connected: connectivity.connected,
        error: connectivity.error,
        authenticated: sessionInfo.authenticated
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Service unavailable'
    });
  }
});

/**
 * Connectivity test endpoint
 */
app.get('/connectivity', async (req, res) => {
  const client = new BlueskyClient();

  const identifier = req.headers['x-bluesky-identifier'] as string;
  const password = req.headers['x-bluesky-password'] as string;

  try {
    const connectivity = await client.testConnectivity();

    if (!connectivity.connected) {
      return res.json({
        success: false,
        connected: false,
        error: connectivity.error
      });
    }

    // Try to authenticate if credentials provided
    if (identifier && password) {
      try {
        await client.authenticate({
          identifier: sanitizeString(identifier),
          password
        });
        const sessionInfo = client.getSessionInfo();

        return res.json({
          success: true,
          connected: true,
          authenticated: sessionInfo.authenticated,
          did: sessionInfo.did,
          handle: sessionInfo.handle
        });
      } catch {
        return res.status(401).json({
          success: false,
          connected: true,
          error: 'Authentication failed'
        });
      }
    }

    res.json({
      success: true,
      connected: true,
      authenticated: false
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: formatError(error)
    });
  }
});

/**
 * Search posts endpoint
 */
app.get('/search/posts', async (req, res) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required'
      });
    }

    const client = new BlueskyClient();
    const result = await client.searchPosts({
      q: sanitizeString(query),
      limit: Math.min(limit, 100)
    });

    res.json({
      success: true,
      data: result.posts,
      cursor: result.cursor
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: formatError(error)
    });
  }
});

/**
 * Search actors endpoint
 */
app.get('/search/actors', async (req, res) => {
  try {
    const term = req.query.q as string || req.query.term as string;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!term) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" or "term" is required'
      });
    }

    const client = new BlueskyClient();
    const result = await client.searchActors({
      term: sanitizeString(term),
      limit: Math.min(limit, 100)
    });

    res.json({
      success: true,
      data: result.actors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: formatError(error)
    });
  }
});

/**
 * Get profile endpoint
 */
app.get('/profile/:actor', async (req, res) => {
  try {
    const client = new BlueskyClient();
    const profile = await client.getProfile(sanitizeString(req.params.actor));

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: formatError(error)
    });
  }
});

/**
 * Get timeline endpoint (requires auth)
 */
app.get('/timeline', async (req, res) => {
  const identifier = req.headers['x-bluesky-identifier'] as string;
  const password = req.headers['x-bluesky-password'] as string;

  if (!identifier || !password) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Provide X-BLUESKY-IDENTIFIER and X-BLUESKY-PASSWORD headers.'
    });
  }

  try {
    const client = new BlueskyClient();
    await client.authenticate({ identifier, password });

    const cursor = req.query.cursor as string;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await client.getTimeline({
      cursor,
      limit: Math.min(limit, 100)
    });

    res.json({
      success: true,
      data: result.feed,
      cursor: result.cursor
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: formatError(error)
    });
  }
});

/**
 * Create post endpoint (requires auth)
 */
app.post('/post', async (req, res) => {
  const identifier = req.headers['x-bluesky-identifier'] as string;
  const password = req.headers['x-bluesky-password'] as string;

  if (!identifier || !password) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Provide X-BLUESKY-IDENTIFIER and X-BLUESKY-PASSWORD headers.'
    });
  }

  try {
    const { text, langs } = req.body;

    // Validate post
    const validation = validatePostText(text);
    if (!validation.valid || !validation.text) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const client = new BlueskyClient();
    await client.authenticate({ identifier, password });

    const result = await client.createPost(validation.text, { langs });

    res.json({
      success: true,
      data: {
        uri: result.uri,
        cid: result.cid,
        url: `https://bsky.app/profile/${result.uri.split('/')[2]}/post/${result.uri.split('/')[4]}`
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: formatError(error)
    });
  }
});

// Start server
const server = createServer(app);

server.listen(PORT, () => {
  console.log(`Bluesky MCP Server running on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});