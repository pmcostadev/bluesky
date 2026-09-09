import { corsHeaders, originBlocked, preflight } from '@/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Start a Composio connection.
 *
 *   POST /api/connect/link  { authConfigId?, userId?, callbackUrl? }
 *     -> { redirectUrl, connectionId, userId }
 *
 * `userId` comes back so the caller can poll /api/connect/status by user. That
 * matters because the id in this response is not always the id the connected
 * account ends up with, and polling the wrong one never resolves.
 *
 * ---
 * This endpoint deliberately does NOT send a callback_url by default.
 *
 * Composio's hosted link page is the last document in the popup, and it closes
 * that popup itself. Passing a callback_url replaces that page with one of ours,
 * which takes the ending away from the party that owns the window: our page
 * cannot reliably close a popup whose opener COOP has already severed, so the
 * window just sits there.
 *
 * Product Hunt has no callback page at all and its popup closes cleanly. That is
 * not a coincidence, it is the reason. Overriding the landing page bought us
 * nothing and cost us the close.
 *
 * A caller that genuinely wants its own landing page can pass callbackUrl
 * explicitly, and owns the consequences.
 */

const COMPOSIO_API = 'https://backend.composio.dev/api/v3';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set on this deployment.`);
  return v;
}

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function POST(req: Request) {
  const cors = corsHeaders(req);

  if (originBlocked(req)) {
    return Response.json(
      { error: 'origin_not_allowed', message: 'This origin is not on CONNECT_ALLOWED_ORIGINS.' },
      { status: 403, headers: cors }
    );
  }

  let body: { authConfigId?: string; userId?: string; callbackUrl?: string } = {};
  try {
    body = await req.json();
  } catch {
    // An empty body is fine; fall back to env defaults.
  }

  let apiKey: string;
  let authConfigId: string;
  try {
    apiKey = requireEnv('COMPOSIO_API_KEY');
    authConfigId = body.authConfigId ?? requireEnv('COMPOSIO_AUTH_CONFIG_ID');
  } catch (e) {
    return Response.json(
      { error: 'not_configured', message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers: cors }
    );
  }

  const userId = body.userId ?? process.env.COMPOSIO_USER_ID ?? 'default';

  // Opt-in only. Unset means Composio keeps its own landing page, and its own
  // popup close.
  const callbackUrl = body.callbackUrl ?? process.env.COMPOSIO_CALLBACK_URL ?? null;

  const payload: Record<string, unknown> = {
    user_id: userId,
    auth_config_id: authConfigId
  };
  if (callbackUrl) payload.callback_url = callbackUrl;

  try {
    const res = await fetch(`${COMPOSIO_API}/connected_accounts/link`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000)
    });

    const text = await res.text();
    if (!res.ok) {
      return Response.json(
        { error: 'composio_error', status: res.status, detail: text.slice(0, 500) },
        { status: 502, headers: cors }
      );
    }

    const data = JSON.parse(text) as {
      redirect_url?: string;
      redirectUrl?: string;
      connected_account_id?: string;
      connectedAccountId?: string;
      id?: string;
    };
    const redirectUrl = data.redirect_url ?? data.redirectUrl;
    if (!redirectUrl) {
      return Response.json(
        { error: 'no_redirect_url', detail: text.slice(0, 500) },
        { status: 502, headers: cors }
      );
    }

    return Response.json(
      {
        redirectUrl,
        connectionId: data.connected_account_id ?? data.connectedAccountId ?? data.id ?? null,
        userId,
        callbackUrl
      },
      { headers: cors }
    );
  } catch (e) {
    return Response.json(
      { error: 'request_failed', message: e instanceof Error ? e.message : String(e) },
      { status: 502, headers: cors }
    );
  }
}
