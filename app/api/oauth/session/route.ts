import { getOAuthClient } from '@/oauth/client';
import { KEYS, kvDel, kvGet } from '@/oauth/store';

export const runtime = 'nodejs';

/**
 * Session diagnostics and reset.
 *
 *   GET /api/oauth/session?key=...&did=...          inspect the granted scope
 *   GET /api/oauth/session?key=...&did=...&reset=1  delete it
 *
 * Why this exists: reconnecting in an MCP client does not necessarily re-run
 * the Bluesky authorization. If the client only refreshes its own token, the
 * stored atproto session survives with whatever scope it was granted
 * originally, so a newly added scope (like transition:chat.bsky) never takes
 * effect. Deleting the stored session forces the next authorize to go all the
 * way to a real consent screen.
 *
 * Guarded by a prefix of OAUTH_SIGNING_SECRET so it is not a public reset
 * button.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const did = url.searchParams.get('did');
  const reset = url.searchParams.get('reset') === '1';
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

  if (!did) {
    return Response.json({ error: 'missing_did', hint: 'Pass ?did=did:plc:...' }, { status: 400 });
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
