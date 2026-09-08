import {
  NodeOAuthClient,
  type NodeSavedSession,
  type NodeSavedState
} from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';
import { KEYS, kvDel, kvGet, kvSet, withLock } from './store';

/**
 * The AT Protocol OAuth client.
 *
 * @atproto/oauth-client-node carries the parts of atproto OAuth that are
 * mandatory and unpleasant to hand-roll: DPoP proofs, rotating server nonces,
 * PAR, PKCE, and identity resolution from handle to PDS. We supply the storage
 * and the signing key.
 *
 * Registered as a *confidential* client (we hold a private key and sign client
 * assertions), which is what earns long-lived sessions. A public client would
 * cap sessions at 14 days.
 */

const STATE_TTL_S = 15 * 60;

let cached: Promise<NodeOAuthClient> | null = null;

function privateKeyJwk(): string {
  const raw = process.env.BLUESKY_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      'BLUESKY_PRIVATE_KEY is not set. It must contain the base64-encoded ES256 private key in JWK form.'
    );
  }
  // Accept either raw JSON or base64-encoded JSON.
  const text = raw.trim().startsWith('{')
    ? raw.trim()
    : Buffer.from(raw.trim(), 'base64').toString('utf8');
  JSON.parse(text); // fail loudly here rather than deep inside the library
  return text;
}

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
    token_endpoint_auth_method: 'private_key_jwt' as const,
    token_endpoint_auth_signing_alg: 'ES256',
    dpop_bound_access_tokens: true as const,
    jwks_uri: `${origin}/jwks.json`
  };
}

export function getOAuthClient(): Promise<NodeOAuthClient> {
  cached ??= (async () => {
    const key = await JoseKey.fromImportable(privateKeyJwk(), 'key1');

    return new NodeOAuthClient({
      clientMetadata: clientMetadata(),
      keyset: [key],

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

/** Public half of the keyset, for /jwks.json. */
export async function publicJwks() {
  const client = await getOAuthClient();
  return client.jwks;
}
