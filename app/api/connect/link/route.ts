export const runtime = 'nodejs';

/**
 * Start a Composio connection with our own landing page.
 *
 * Composio's dashboard "Connect" button always returns the user to
 * dashboard.composio.dev, because the landing page is set by a `callback_url`
 * passed when the connection is created, and the dashboard passes its own.
 * The only way to control it is to create the connection ourselves.
 *
 * POST /api/connect/link { authConfigId?, userId? }
 *   -> { redirectUrl, connectionId, callbackUrl }
 */

const COMPOSIO_API = 'https://backend.composio.dev/api/v3';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set on this deployment.`);
  return v;
}

function publicOrigin(req: Request): string {
  const explicit = process.env.OAUTH_PUBLIC_ORIGIN;
  if (explicit) return explicit.replace(/\/$/, '');
  const h = req.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  let body: { authConfigId?: string; userId?: string } = {};
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
      { status: 500 }
    );
  }

  const userId = body.userId ?? process.env.COMPOSIO_USER_ID ?? 'default';
  const callbackUrl = `${publicOrigin(req)}/connected`;

  try {
    const res = await fetch(`${COMPOSIO_API}/connected_accounts/link`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        auth_config_id: authConfigId,
        callback_url: callbackUrl
      }),
      signal: AbortSignal.timeout(15_000)
    });

    const text = await res.text();
    if (!res.ok) {
      return Response.json(
        { error: 'composio_error', status: res.status, detail: text.slice(0, 500) },
        { status: 502 }
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
        { status: 502 }
      );
    }

    return Response.json({
      redirectUrl,
      connectionId: data.connected_account_id ?? data.connectedAccountId ?? data.id ?? null,
      callbackUrl
    });
  } catch (e) {
    return Response.json(
      { error: 'request_failed', message: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
