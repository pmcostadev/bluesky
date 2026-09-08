import { NextRequest, NextResponse } from 'next/server';
import { createMCPServer } from '@/mcp-server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

/**
 * Parse credentials from a "identifier:password" combined string.
 * Splits on the FIRST colon only, so passwords containing colons are safe.
 */
function parseCombined(value: string): { identifier: string; password: string } | null {
  const colonIndex = value.indexOf(':');
  if (colonIndex === -1) return null;
  const identifier = value.substring(0, colonIndex).trim();
  const password = value.substring(colonIndex + 1).trim();
  if (!identifier || !password) return null;
  return { identifier, password };
}

/**
 * Extract Bluesky credentials from the request using one of three methods:
 *
 * Method 1 — Two separate headers (HuggingChat, curl):
 *   X-BLUESKY-IDENTIFIER: handle.bsky.social
 *   X-BLUESKY-PASSWORD: your-app-password
 *
 * Method 2 — Single combined header (Vibe, custom clients):
 *   X-BLUESKY-CREDENTIALS: handle.bsky.social:your-app-password
 *
 * Method 3 — Authorization Bearer (MCP Playground, OpenAI-style clients):
 *   Authorization: Bearer handle.bsky.social:your-app-password
 */
function extractCredentials(req: NextRequest): { identifier?: string; password?: string } {
  // Method 1: two explicit headers (highest priority)
  const identifier = req.headers.get('x-bluesky-identifier') ?? undefined;
  const password = req.headers.get('x-bluesky-password') ?? undefined;
  if (identifier && password) {
    return { identifier, password };
  }

  // Method 2: single combined header
  const combined = req.headers.get('x-bluesky-credentials');
  if (combined) {
    const parsed = parseCombined(combined);
    if (parsed) return parsed;
  }

  // Method 3: Authorization: Bearer handle:password
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const parsed = parseCombined(token);
    if (parsed) return parsed;
  }

  return {};
}

export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = extractCredentials(req);

    const server = createMCPServer({ identifier, password });
    const transport = new WebStandardStreamableHTTPServerTransport();

    await server.connect(transport);
    return await transport.handleRequest(req);
  } catch (error) {
    console.error('MCP POST error:', error);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error)
        },
        id: null
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'MCP endpoint active',
    version: '1.0.0',
    transport: 'WebStandardStreamableHTTPServerTransport (POST only)',
    auth: {
      methods: [
        'Two headers: X-BLUESKY-IDENTIFIER + X-BLUESKY-PASSWORD',
        'Single header: X-BLUESKY-CREDENTIALS: handle:password',
        'Bearer token: Authorization: Bearer handle:password'
      ]
    }
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': [
        'Content-Type',
        'Authorization',
        'x-bluesky-identifier',
        'x-bluesky-password',
        'x-bluesky-credentials',
        'mcp-session-id'
      ].join(', '),
      'Access-Control-Max-Age': '86400',
    },
  });
}
