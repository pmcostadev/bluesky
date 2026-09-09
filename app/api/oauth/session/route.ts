import { clientMetadata, getOAuthClient, isConfidential, publicJwks } from '@/oauth/client';
import { KEYS, kvDel, kvGet, kvKeys } from '@/oauth/store';

export const runtime = 'nodejs';

/**
 * Session diagnostics and reset.
 *
 *   GET /api/oauth/session?key=...                  report the client mode
 *   GET /api/oauth/session?key=...&resetAll=1       delete every stored session
 *   GET /api/oauth/session?key=...&did=...          inspect the granted scope
 *   GET /api/oauth/session?key=...&did=...&reset=1  delete one session
 *
 * Why this exists: reconnecting in an MCP client does not necessarily re-run
 * the Bluesky authorization. If the client only refreshes its own token, the
 * stored atproto session survives with whatever scope and lifetime it was
 * granted originally, so a newly added scope (transition:chat.bsky) or a switch
 * from public to confidential client never reaches existing accounts. Deleting
 * the stored session forces the next authorize to go all the way to a real
 * consent screen.
 *
 * Guarded by a prefix of OAUTH_SIGNING_SECRET so it is not a public reset
 * button.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const did = url.searchParams.get('did');
  const reset = url.searchParams.get('reset') === '1';
  const resetAll = url.searchParams.get('resetAll') === '1';
  const key = url.searchParams.get('key');

  const secret = process.env.OAUTH_SIGNING_SECRET;
  if (!secret || key !== secret.slice(0, 12)) {
    return Response.json(
      {
        error: 'unauthorized',
        hint: 'Pass ?key=<first 12 characters of OAUTH_SIGNING_SECRET>'
      },
      { status: 401 }
    );
  }

  // Clear every stored session. Useful after changing scope or client mode,
  // and it does not require knowing anyone's DID.
  if (resetAll) {
    const keys = await kvKeys(KEYS.sessionPattern);
    const cleared: string[] = [];

    for (const k of keys) {
      await kvDel(k);
      cleared.push(k.replace('bsky:session:', ''));
    }

    return Response.json({
      resetAll: true,
      clearedCount: cleared.length,
      cleared,
      clientMode: isConfidential() ? 'confidential' : 'public',
      note:
        cleared.length === 0
          ? 'No stored sessions were found, so there was nothing to clear. Connecting an account will create a fresh one.'
          : 'Sessions deleted. Reconnect each account to get a fresh consent screen and a session issued under the current client mode.'
    });
  }

  // No DID: report how this deployment is registered. This is the quickest way
  // to confirm the confidential keys actually loaded.
  if (!did) {
    const confidential = isConfidential();
    let keyCount = 0;
    let keyError: string | null = null;
    try {
      keyCount = (await publicJwks()).keys.length;
    } catch (e) {
      keyError = e instanceof Error ? e.message : String(e);
    }

    const meta = clientMetadata() as Record<string, unknown>;

    let storedSessions: number | null = null;
    try {
      storedSessions = (await kvKeys(KEYS.sessionPattern)).length;
    } catch {
      // storage may be unreachable; the rest of the report is still useful
    }

    return Response.json({
      clientMode: confidential ? 'confidential' : 'public',
      sessionLifetime: confidential ? 'up to 180 days per refresh token' : '14 days (atproto cap)',
      tokenEndpointAuthMethod: meta.token_endpoint_auth_method ?? null,
      jwksUri: meta.jwks_uri ?? null,
      signingKeys: keyCount,
      keyError,
      storedSessions,
      requestedScope: process.env.BLUESKY_SCOPE ?? '(default)',
      hint: 'Add ?did=did:plc:... to inspect one session, or &resetAll=1 to clear them all.'
    });
  }

  const stored = await kvGet<Record<string, any>>(KEYS.session(did));

  if (!stored) {
    return Response.json({ did, stored: false, note: 'No session in storage.' });
  }

  // The saved shape is { tokenSet, dpopJwk }. The granted scope lives on tokenSet.
  const tokenSet = (stored.tokenSet ?? {}) as Record<string, any>;

  if (reset) {
    await kvDel(KEYS.session(did));
    return Response.json({
      did,
      reset: true,
      previousScope: tokenSet.scope ?? null,
      note: 'Session deleted. Reconnect the account to get a fresh consent screen.'
    });
  }

  let restorable = false;
  let restoreError: string | null = null;
  try {
    const oauth = await getOAuthClient();
    await oauth.restore(did);
    restorable = true;
  } catch (e) {
    restoreError = e instanceof Error ? e.message : String(e);
  }

  return Response.json({
    did,
    stored: true,
    clientMode: isConfidential() ? 'confidential' : 'public',
    grantedScope: tokenSet.scope ?? null,
    hasChatScope: String(tokenSet.scope ?? '').includes('chat.bsky'),
    tokenType: tokenSet.token_type ?? null,
    expiresAt: tokenSet.expires_at ?? null,
    sub: tokenSet.sub ?? null,
    restorable,
    restoreError,
    requestedScope: process.env.BLUESKY_SCOPE ?? '(default)',
    note:
      'grantedScope is what Bluesky actually granted. If it lacks chat.bsky, add &reset=1 to delete the session, then reconnect the account.'
  });
}
