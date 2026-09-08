import { getOAuthClient } from '@/oauth/client';
import { seal, unseal } from '@/oauth/seal';

export const runtime = 'nodejs';
export const maxDuration = 30;

type FlowState = { cru: string; cs?: string; cc: string; cid: string };

/**
 * The user's PDS sends them back here after approving.
 *
 * The atproto client completes the token exchange (with DPoP), verifies that the
 * returned DID really is served by that issuer, and persists the session. We
 * then mint our own authorization code carrying only the DID, and hand it to
 * whichever MCP client started the flow.
 *
 * Note on state: the `state` parameter in this URL is the library's own opaque
 * handle, not the value we passed to authorize(). The library keeps ours in its
 * state store and returns it as `state` from callback(). Reading the URL instead
 * is what caused "the original request could not be matched".
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  const plain = (msg: string, status = 400) =>
    new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  const redirectBack = (st: FlowState, fields: Record<string, string>) => {
    const to = new URL(st.cru);
    for (const [k, v] of Object.entries(fields)) to.searchParams.set(k, v);
    if (st.cs) to.searchParams.set('state', st.cs);
    return Response.redirect(to.toString(), 302);
  };

  // A denial arrives before callback() can run, and the library will not hand
  // our state back in that case, so there is nowhere to redirect to.
  const denied = params.get('error');
  if (denied) {
    const description = params.get('error_description') ?? 'Bluesky denied the request.';
    return plain(
      denied === 'access_denied'
        ? 'You declined the request, so nothing was connected. You can close this window.'
        : `Sign-in failed: ${description}`,
      400
    );
  }

  try {
    const oauth = await getOAuthClient();
    const { session, state } = await oauth.callback(params);

    let st: FlowState;
    try {
      if (!state) throw new Error('no state returned');
      st = unseal<FlowState>('state', state);
    } catch {
      return plain(
        `Signed in as ${session.did}, but this sign-in could not be matched to a request. Start again from your client.`,
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

    return redirectBack(st, { code });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return plain(`Sign-in failed: ${msg.slice(0, 300)}`, 400);
  }
}
