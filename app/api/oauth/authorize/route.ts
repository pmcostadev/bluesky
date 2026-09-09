import { BSKY_SCOPE, getOAuthClient } from '@/oauth/client';
import { seal, unseal } from '@/oauth/seal';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Start a login.
 *
 * atproto has no single login page: every account lives on its own PDS, which is
 * why most atproto apps ask for a handle first. But the OAuth client also
 * accepts a HOST as its input, in which case that host's own login screen
 * identifies the user, exactly like a centralised provider.
 *
 * So the default path asks for nothing: we send the user straight to
 * bsky.social, where the vast majority of accounts live, and they sign in there.
 * The handle form only appears for people who need it:
 *
 *   /api/oauth/authorize?...                 -> straight to bsky.social
 *   /api/oauth/authorize?...&chooser=1       -> show the handle form
 *   /api/oauth/authorize?...&handle=x.com    -> use that handle or PDS directly
 *
 * BLUESKY_DEFAULT_PDS overrides the default host.
 */

const DEFAULT_PDS = process.env.BLUESKY_DEFAULT_PDS ?? 'https://bsky.social';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect Bluesky</title>
<style>
  :root{--ink:#0b1220;--card:#141c2b;--line:#243043;--sky:#1185fe;--text:#eef3fb;--muted:#93a1b8}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--ink);
    color:var(--text);font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;padding:24px}
  .card{width:100%;max-width:420px;background:var(--card);border:1px solid var(--line);
    border-radius:16px;padding:32px}
  h1{margin:0 0 8px;font-size:22px;letter-spacing:-.02em}
  p{margin:0 0 22px;color:var(--muted);font-size:14px;line-height:1.6}
  label{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;
    color:var(--muted);margin-bottom:8px}
  input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--line);
    background:#0e1522;color:var(--text);font-size:15px;outline:none}
  input:focus{border-color:var(--sky)}
  button{width:100%;margin-top:16px;padding:13px;border:0;border-radius:10px;
    background:var(--sky);color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  button:hover{background:#3aa0ff}
  code{font-family:ui-monospace,monospace;font-size:13px;color:var(--text)}
  .note{margin-top:18px;font-size:12.5px;color:var(--muted);line-height:1.6}
  .err{background:#2a1620;border:1px solid #5b2434;color:#ffd9e0;padding:12px 14px;
    border-radius:10px;font-size:13.5px;line-height:1.5;margin-bottom:18px;word-break:break-word}
</style></head><body><div class="card">${body}</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;

  const clientId = q.get('client_id') ?? '';
  const redirectUri = q.get('redirect_uri') ?? '';
  const responseType = q.get('response_type') ?? '';
  const codeChallenge = q.get('code_challenge') ?? '';
  const method = q.get('code_challenge_method') ?? '';
  const state = q.get('state') ?? '';
  const handle = (q.get('handle') ?? '').trim();
  const chooser = q.get('chooser') === '1';

  if (!clientId.startsWith('bskc_')) {
    return page(
      '<h1>Unknown application</h1><p>That client_id was not issued by this server.</p>',
      400
    );
  }

  let client: { ru: string[]; n: string };
  try {
    client = unseal('client', clientId.slice(5));
  } catch {
    return page('<h1>Invalid application</h1><p>That client_id is not valid here.</p>', 400);
  }

  if (!redirectUri || !client.ru.includes(redirectUri)) {
    return page(
      '<h1>Redirect mismatch</h1><p>The redirect_uri does not match any URI registered for this application.</p>',
      400
    );
  }

  const back = (error: string, description: string) => {
    const to = new URL(redirectUri);
    to.searchParams.set('error', error);
    to.searchParams.set('error_description', description);
    if (state) to.searchParams.set('state', state);
    return Response.redirect(to.toString(), 302);
  };

  if (responseType !== 'code') {
    return back('unsupported_response_type', 'Only response_type=code is supported.');
  }
  if (!codeChallenge) return back('invalid_request', 'code_challenge is required.');
  if (method !== 'S256') return back('invalid_request', 'code_challenge_method must be S256.');

  const carry = () => {
    const p = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    if (state) p.set('state', state);
    return p;
  };

  const hiddenFields = () =>
    [...carry().entries()]
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`)
      .join('');

  const handleForm = (label: string, value = '') => `
      <form method="GET" action="/api/oauth/authorize">
        ${hiddenFields()}
        <label for="handle">Handle, DID, or server</label>
        <input id="handle" name="handle" value="${escapeHtml(value)}"
               placeholder="yourname.bsky.social" autocapitalize="none"
               autocorrect="off" spellcheck="false" autofocus required>
        <button type="submit">${label}</button>
      </form>`;

  // Only shown when explicitly requested, for self-hosted PDS users.
  if (chooser && !handle) {
    const straight = new URL('/api/oauth/authorize', req.url);
    for (const [k, v] of carry()) straight.searchParams.set(k, v);

    return page(`
      <h1>Where is your account?</h1>
      <p>${escapeHtml(client.n)} wants to act on your behalf. If your account is not on
      bsky.social, enter your handle or your server's address.</p>
      ${handleForm('Continue')}
      <p class="note"><a href="${escapeHtml(straight.pathname + straight.search)}"
        style="color:#1185fe">On bsky.social? Sign in there instead.</a></p>
    `);
  }

  // Our own flow state rides along in atproto's `state`, so the callback can
  // reconstruct where to send the MCP client without extra storage.
  const carried = seal('state', {
    cru: redirectUri,
    cs: state,
    cc: codeChallenge,
    cid: clientId,
    exp: Date.now() + 15 * 60 * 1000
  });

  // No handle: send them straight to the default host and let its own login
  // screen work out who they are. This is the zero-input path.
  const target = handle || DEFAULT_PDS;

  try {
    const oauth = await getOAuthClient();
    const url = await oauth.authorize(target, { state: carried, scope: BSKY_SCOPE });
    return Response.redirect(url.toString(), 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    // Falling back to the form is the useful failure: a handle typo, or a PDS
    // that could not be resolved.
    return page(
      `<div class="err">${escapeHtml(msg)}</div>
       <h1>Could not start sign-in</h1>
       <p>Enter your handle so we can find your server. It should look like
       <code>name.bsky.social</code>.</p>
       ${handleForm('Try again', handle)}`,
      400
    );
  }
}
