import { getOAuthClient } from '@/oauth/client';
import { seal, unseal } from '@/oauth/seal';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * The user's PDS sends them back here after approving.
 *
 * The atproto client completes the token exchange (with DPoP and the client
 * assertion), verifies that the returned DID really is served by that issuer,
 * and persists the session. We then mint our own authorization code carrying
 * only the DID, and hand it to whichever MCP client started the flow.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  const plain = (msg: string, status = 400) =>
    new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  // Recover our flow state first so failures can be reported to the caller.
  let st: { cru: string; cs: string; cc: string; cid: string } | null = null;
  const carried = params.get('state');
  if (carried) {
    try {
      st = unseal('state', carried);
    } catch {
      st = null;
    }
  }

  const back = (fields: Record<string, string>) => {
    if (!st) return plain('This sign-in link expired. Please start again.');
    const to = new URL(st.cru);
    for (const [k, v] of Object.entries(fields)) to.searchParams.set(k, v);
    if (st.cs) to.searchParams.set('state', st.cs);
    return Response.redirect(to.toString(), 302);
  };

  const denied = params.get('error');
  if (denied) {
    return back({
      error: denied === 'access_denied' ? 'access_denied' : 'invalid_request',
      error_description: params.get('error_description') ?? 'Bluesky denied the request.'
    });
  }

  try {
    const oauth = await getOAuthClient();
    const { session } = await oauth.callback(params);

    if (!st) {
      return plain(
        `Signed in as ${session.did}, but the original request could not be matched. Please start again from your client.`,
        400
      );
    }

    // session.did is verified by the library against the issuing server.
    const code = seal('code', {
      did: session.did,
      cc: st.cc,
      cru: st.cru,
      cid: st.cid,
      exp: Date.now() + 5 * 60 * 1000
    });

    return back({ code });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return back({ error: 'server_error', error_description: msg.slice(0, 300) });
  }
}
