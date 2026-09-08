import {
  NodeOAuthClient,
  type NodeSavedSession,
  type NodeSavedState
} from '@atproto/oauth-client-node';
import { KEYS, kvDel, kvGet, kvSet, withLock } from './store';

/**
 * The AT Protocol OAuth client.
 *
 * @atproto/oauth-client-node carries the parts of atproto OAuth that are
 * mandatory and unpleasant to hand-roll: DPoP proofs, rotating server nonces,
 * PAR, PKCE, and identity resolution from handle to PDS. We supply the storage.
 *
 * ---
 * Registered as a PUBLIC client (token_endpoint_auth_method: 'none'), which
 * means no signing keyset and no client assertions.
 *
 * Why not confidential: npm resolves two copies of @atproto/jwk, one nested
 * under jwk-jose and one under oauth-client-node. A JoseKey built from the
 * first is not an instanceof the Key class the second checks against, so the
 * keyset silently ends up empty and client construction fails with "requires at
 * least one ES256 signing key with a kid". The real fix is to dedupe that
 * transitive dependency; until then, a public client is fully functional.
 *
 * Tradeoff: atproto caps public-client sessions and refresh tokens at 14 days,
 * so a connected account needs re-authorising roughly every two weeks.
 * Confidential clients get up to 180 days per refresh token.
 */

const STATE_TTL_S = 15 * 60;

let cached: Promise<NodeOAuthClient> | null = null;

export function publicOrigin(): string {
  const origin = process.env.OAUTH_PUBLIC_ORIGIN;
  if (!origin) {
    throw new Error(
      'OAUTH_PUBLIC_ORIGIN is not set. It must be the public https origin of this deployment, e.g. https://bluesky.pmcosta.dev'
    );
  }
  return origin.replace(/\/$/, '');
}

/** Scopes we request from the user's PDS. transition:generic ~ full read/write. */
export const BSKY_SCOPE = process.env.BLUESKY_SCOPE ?? 'atproto transition:generic';

export function clientMetadata() {
  const origin = publicOrigin();
  return {
    client_id: `${origin}/client-metadata.json`,
    client_name: 'Bluesky MCP',
    client_uri: origin,
    redirect_uris: [`${origin}/api/oauth/callback`] as [string],
    grant_types: ['authorization_code', 'refresh_token'] as [
      'authorization_code',
      'refresh_token'
    ],
    response_types: ['code'] as ['code'],
    scope: BSKY_SCOPE,
    application_type: 'web' as const,
    token_endpoint_auth_method: 'none' as const,
    dpop_bound_access_tokens: true as const
  };
}

export function getOAuthClient(): Promise<NodeOAuthClient> {
  cached ??= (async () => {
    return new NodeOAuthClient({
      clientMetadata: clientMetadata(),

      stateStore: {
        async set(k: string, state: NodeSavedState) {
          await kvSet(KEYS.state(k), state, STATE_TTL_S);
        },
        async get(k: string) {
          return (await kvGet<NodeSavedState>(KEYS.state(k))) ?? undefined;
        },
        async del(k: string) {
          await kvDel(KEYS.state(k));
        }
      },

      sessionStore: {
        async set(sub: string, session: NodeSavedSession) {
          await kvSet(KEYS.session(sub), session);
        },
        async get(sub: string) {
          return (await kvGet<NodeSavedSession>(KEYS.session(sub))) ?? undefined;
        },
        async del(sub: string) {
          await kvDel(KEYS.session(sub));
        }
      },

      // Serverless runs many instances; without this, two concurrent requests
      // can both spend the same single-use refresh token and kill the session.
      requestLock: async (name: string, fn: () => any) => withLock(name, fn)
    });
  })();

  return cached;
}

/**
 * Public clients advertise no JWKS. The route is kept so the path does not 404
 * for anything that probes it, and so restoring confidential mode later is a
 * one-file change rather than a re-plumb.
 */
export async function publicJwks() {
  return { keys: [] as unknown[] };
}
