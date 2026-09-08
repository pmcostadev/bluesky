import { NextRequest, NextResponse } from 'next/server';
import { createMCPServer } from '@/mcp-server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { AuthError, bearerOf, resolveAuth } from '@/oauth/resolve';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CORS_HEADERS = [
  'Content-Type',
  'Authorization',
  'mcp-session-id',
  'mcp-protocol-version'
].join(', ');

function publicOrigin(req: NextRequest): string {
  const explicit = process.env.OAUTH_PUBLIC_ORIGIN;
  if (explicit) return explicit.replace(/\/$/, '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

/**
 * Answer an unauthenticated call the way the MCP spec expects: 401 plus a
 * WWW-Authenticate header naming the resource metadata document. Compliant
 * clients read that, discover the authorization server, and start the OAuth
 * flow on their own instead of guessing.
 */
function unauthorized(req: NextRequest, message: string) {
  const origin = publicOrigin(req);
  return NextResponse.json(
    {
      jsonrpc: '2.0',
      error: { code: -32001, message },
      id: null
    },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
}

export async function POST(req: NextRequest) {
  let auth;
  try {
    auth = await resolveAuth(bearerOf(req));
  } catch (error) {
    if (error instanceof AuthError) return unauthorized(req, error.message);
    console.error('MCP auth error:', error);
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

  try {
    const server = createMCPServer(auth);
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

export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  return NextResponse.json({
    status: 'MCP endpoint active',
    version: '2.0.0',
    transport: 'WebStandardStreamableHTTPServerTransport (POST only)',
    auth: {
      type: 'OAuth 2.1 (AT Protocol)',
      note: 'App passwords are no longer accepted. Connect a Bluesky account through OAuth; the access token is sent as "Authorization: Bearer <token>".',
      authorization_server: origin,
      metadata: `${origin}/.well-known/oauth-authorization-server`,
      resource_metadata: `${origin}/.well-known/oauth-protected-resource`
    }
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': CORS_HEADERS,
      'Access-Control-Expose-Headers': 'WWW-Authenticate, mcp-session-id',
      'Access-Control-Max-Age': '86400'
    }
  });
}
