import { originOf } from '@/oauth/seal';

export const runtime = 'nodejs';

/**
 * RFC 8414 metadata for the authorization server *we* expose to MCP clients.
 *
 * Not to be confused with /client-metadata.json, which is what we present to
 * Bluesky. Two hats: we are a client to Bluesky, and a server to Composio.
 */
export async function GET(req: Request) {
  const origin = originOf(req);
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/api/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      scopes_supported: ['atproto', 'transition:generic'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      service_documentation: 'https://github.com/pmcostadev/bluesky'
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } }
  );
}
