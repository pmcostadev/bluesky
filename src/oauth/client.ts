import {
  JoseKey,
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
 * CONFIDENTIAL client when signing keys are configured, PUBLIC client otherwise.
 *
 * Why this matters: atproto caps public-client sessions and refresh tokens at
 * 14 days, so every connected account has to re-authorise roughly every two
 * weeks. A confidential client authenticates to the token endpoint with a
 * signed assertion (private_key_jwt) and gets up to 180 days per refresh token.
 *
 * The earlier blocker was a duplicate @atproto/jwk in node_modules: a JoseKey
 * built from the copy nested under a directly-installed @atproto/jwk-jose was
 * not an instanceof the Key class that oauth-client-node checks against, so the
 * keyset silently ended up empty. The fix is to stop depending on
 * @atproto/jwk-jose directly and import JoseKey from oauth-client-node, which
 * re-exports it from its own single copy of the dependency tree. See the
 * @atproto/jwk note in package.json for the version constraint that goes with
 * it.
 */

const STATE_TTL_S = 15 * 60;

type ClientMetadata = ConstructorParameters<typeof NodeOAuthClient>[0]['clientMetadata'];

let cached: Promise<NodeOAuthClient> | null = null;
let cachedKeyset: Promise<JoseKey[]> | null = null;

export function publicOrigin(): string {
  const origin = process.env.OAUTH_PUBLIC_ORIGIN;
  if (!origin) {
    throw new Error(
      'OAUTH_PUBLIC_ORIGIN is not set. It must be the public https origin of this deployment, e.g. https://bluesky.pmcosta.dev'
    );
  }
  return origin.replace(/\/$/, '');
}

/**
 * Scopes requested from the user's PDS.
 *
 *   atproto              required on every session
 *   transition:generic   broad read/write on the account's own repo
 *   transition:chat.bsky DMs. Without it, chat.bsky.convo.* calls fail with
 *                        'Missing required scope rpc:chat.bsky.convo...' even
 *                        though the request is otherwise correctly proxied.
 *
 * Changing this only affects NEW authorizations: an account connected under a
 * narrower scope keeps that scope until it reconnects.
 */
export const BSKY_SCOPE =
  process.env.BLUESKY_SCOPE ?? 'atproto transition:generic transition:chat.bsky';

/** Raw private keys from the environment, in preference order. */
function privateKeyEnv(): string[] {
  return [
    process.env.BLUESKY_PRIVATE_KEY_1,
    process.env.BLUESKY_PRIVATE_KEY_2,
    process.env.BLUESKY_PRIVATE_KEY_3
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));
}

/** True when this deployment can authenticate itself to the token endpoint. */
export function isConfidential(): boolean {
  return privateKeyEnv().length > 0;
}

/**
 * A private JWK may not carry "use": that member describes a PUBLIC key, and
 * current @atproto/jwk rejects the combination (older versions only warned).
 * Since "use":"sig" is what every key generator emits, translate it rather than
 * making the operator hand-edit the value.
 */
function normalizeJwk(raw: string): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return raw;
  }

  const isPrivate = Boolean(parsed.d) || Boolean(parsed.k);
  if (!isPrivate || parsed.use == null) return raw;

  parsed.key_ops ??= parsed.use === 'enc' ? ['decrypt'] : ['sign'];
  delete parsed.use;
  return JSON.stringify(parsed);
}

/**
 * Accepts a private key as a JWK JSON string, a PKCS#8 PEM, or either of those
 * base64-encoded (some dashboards mangle multi-line values).
 */
async function importKey(raw: string, index: number): Promise<JoseKey> {
  let value = raw;

  if (!value.startsWith('{') && !value.startsWith('-----')) {
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8').trim();
      if (decoded.startsWith('{') || decoded.startsWith('-----')) value = decoded;
    } catch {
      // fall through to the error below
    }
  }

  const kid = `bsky-${index + 1}`;

  if (value.startsWith('-----')) {
    // Passing the alg explicitly keeps the exported JWK usable for ES256; the
    // library's own PEM path leaves alg empty, which some runtimes reject.
    return JoseKey.fromPKCS8(value.replace(/\\n/g, '\n'), 'ES256', kid);
  }

  if (value.startsWith('{')) {
    return JoseKey.fromJWK(normalizeJwk(value), kid);
  }

  throw new Error(
    `BLUESKY_PRIVATE_KEY_${index + 1} is not a JWK or a PKCS#8 PEM. Expected a value starting with "{" or "-----BEGIN PRIVATE KEY-----".`
  );
}

async function keyset(): Promise<JoseKey[]> {
  cachedKeyset ??= (async () => {
    const raws = privateKeyEnv();
    const keys = await Promise.all(raws.map((raw, i) => importKey(raw, i)));

    const usable = keys.filter((k) => k.algorithms.includes('ES256'));
    if (raws.length > 0 && usable.length === 0) {
      throw new Error(
        'None of the configured BLUESKY_PRIVATE_KEY_* values is an ES256 signing key. atproto requires ES256 (EC P-256).'
      );
    }
    return usable;
  })();

  return cachedKeyset;
}

export function clientMetadata(): ClientMetadata {
  const origin = publicOrigin();
  const base = {
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
    dpop_bound_access_tokens: true as const
  };

  if (!isConfidential()) {
    // Public client: no keyset, no assertions, 14-day sessions.
    return { ...base, token_endpoint_auth_method: 'none' as const };
  }

  return {
    ...base,
    jwks_uri: `${origin}/jwks.json`,
    token_endpoint_auth_method: 'private_key_jwt' as const,
    token_endpoint_auth_signing_alg: 'ES256'
  };
}

export function getOAuthClient(): Promise<NodeOAuthClient> {
  cached ??= (async () => {
    const keys = isConfidential() ? await keyset() : undefined;

    return new NodeOAuthClient({
      clientMetadata: clientMetadata(),
      ...(keys && keys.length ? { keyset: keys } : {}),

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
 * Public half of the signing keyset, served at /jwks.json and referenced by
 * jwks_uri in the client metadata. A public client advertises no keys, so this
 * returns an empty set in that mode rather than 404ing.
 *
 * Every PDS fetches this URL during authorization, so one malformed key must
 * not take the whole document down: bad keys are skipped, not thrown.
 */
export async function publicJwks() {
  if (!isConfidential()) return { keys: [] as unknown[] };

  const keys = await keyset();
  const out: unknown[] = [];

  for (const key of keys) {
    try {
      const jwk = key.publicJwk;
      if (jwk) out.push(jwk);
    } catch {
      // skip a key that cannot be reduced to its public half
    }
  }

  return { keys: out };
}
