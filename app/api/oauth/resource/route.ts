import { originOf } from '@/oauth/seal';

export const runtime = 'nodejs';

/** RFC 9728 protected resource metadata for our MCP endpoint. */
export async function GET(req: Request) {
  const origin = originOf(req);
  return Response.json(
    {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      scopes_supported: ['atproto', 'transition:generic'],
      bearer_methods_supported: ['header']
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } }
  );
}
