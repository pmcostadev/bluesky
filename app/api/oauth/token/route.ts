import { BSKY_SCOPE } from '@/oauth/client';
import { ACCESS_PREFIX, seal, unseal, verifyPkce } from '@/oauth/seal';
import { KEYS, kvGet } from '@/oauth/store';

export const runtime = 'nodejs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
const NO_STORE = { ...CORS, 'Cache-Control': 'no-store', Pragma: 'no-cache' };

const ACCESS_TTL_S = 60 * 60 * 24 * 30;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function fail(error: string, description: string, status = 400) {
  return Response.json({ error, error_description: description }, { status, headers: NO_STORE });
}

async function readParams(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    try {
      const j = await req.json();
      return Object.fromEntries(
        Object.entries(j ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)])
      );
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(await req.text()).entries());
}

/**
 * The scope actually granted by Bluesky for this account.
 *
 * This must be reported accurately. A client that asked for three scopes and
 * receives a response advertising two treats the difference as a partial grant:
 * it cannot know the third was really granted. Returning a hardcoded, narrower
 * string here made every connection look downgraded even when chat access had
 * been approved.
 *
 * Falls back to the requested scope when no session is stored yet.
 */
async function grantedScope(did: string): Promise<string> {
  try {
    const stored = await kvGet<{ tokenSet?: { scope?: string } }>(KEYS.session(did));
    const scope = stored?.tokenSet?.scope;
    if (scope && scope.trim()) return scope.trim();
  } catch {
    // storage hiccup: fall through to the requested scope
  }
  return BSKY_SCOPE;
}

/**
 * Issue our own token. It is only a pointer to the DID: the real Bluesky
 * session (tokens plus DPoP key) stays in Redis, because atproto rotates
 * refresh tokens on every use and they are single-use.
 */
async function issue(did: string) {
  const now = Date.now();
  return Response.json(
    {
      access_token: ACCESS_PREFIX + seal('access', { did, exp: now + ACCESS_TTL_S * 1000 }),
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_S,
      refresh_token: seal('access', { did }),
      scope: await grantedScope(did),
      sub: did
    },
    { headers: NO_STORE }
  );
}

export async function POST(req: Request) {
  const p = await readParams(req);

  if (p.grant_type === 'refresh_token') {
    if (!p.refresh_token) return fail('invalid_request', 'refresh_token is required.');
    try {
      const r = unseal<{ did: string }>('access', p.refresh_token);
      return await issue(r.did);
    } catch {
      return fail('invalid_grant', 'That refresh token is not valid.');
    }
  }

  if (p.grant_type !== 'authorization_code') {
    return fail(
      'unsupported_grant_type',
      'Only authorization_code and refresh_token are supported.'
    );
  }

  if (!p.code) return fail('invalid_request', 'code is required.');
  if (!p.code_verifier) return fail('invalid_request', 'code_verifier is required.');

  let c: { did: string; cc?: string; cru?: string; cid?: string };
  try {
    c = unseal('code', p.code);
  } catch (e) {
    return fail(
      'invalid_grant',
      `Authorization code is invalid or expired (${e instanceof Error ? e.message : 'unknown'}).`
    );
  }

  if (p.client_id && c.cid && p.client_id !== c.cid) {
    return fail('invalid_grant', 'client_id does not match the one that requested this code.');
  }
  if (p.redirect_uri && c.cru && p.redirect_uri !== c.cru) {
    return fail('invalid_grant', 'redirect_uri does not match the authorization request.');
  }
  if (!c.cc || !verifyPkce(p.code_verifier, c.cc)) {
    return fail('invalid_grant', 'code_verifier does not match the code_challenge.');
  }

  return await issue(c.did);
}
