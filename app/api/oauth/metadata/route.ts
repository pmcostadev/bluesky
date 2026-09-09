import { BSKY_SCOPE } from '@/oauth/client';
import { originOf } from '@/oauth/seal';

export const runtime = 'nodejs';

/**
 * RFC 8414 metadata for the authorization server *we* expose to MCP clients.
 *
 * Not to be confused with /client-metadata.json, which is what we present to
 * Bluesky. Two hats: we are a client to Bluesky, and a server to Composio.
 *
 * scopes_supported is derived from BSKY_SCOPE rather than hard-coded. A stale
 * list here silently costs capability: a client that requests only what this
 * document advertises would never ask for transition:chat.bsky, and every DM
 * tool would fail with a missing-scope error even though the server supports
 * them.
 */
export async function GET(req: Request) {
  const origin = originOf(req);
  const scopes = BSKY_SCOPE.split(/\s+/).filter(Boolean);

  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/api/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      scopes_supported: scopes,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      service_documentation: 'https://github.com/pmcostadev/bluesky'
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } }
  );
}
