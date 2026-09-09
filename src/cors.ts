/**
 * CORS for the connect endpoints.
 *
 * The whole point of /api/connect/* is that another app, on another domain,
 * calls it from the browser. Without these headers that call is blocked.
 *
 * CONNECT_ALLOWED_ORIGINS is a comma-separated allowlist. Unset means "any
 * origin", which is convenient while wiring things up but means anyone can ask
 * this deployment to start a Composio connection. Set it once you know which
 * domains your product runs on.
 */

function allowlist(): string[] {
  return (process.env.CONNECT_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const list = allowlist();

  const allowed =
    list.length === 0 ? origin ?? '*' : origin && list.includes(origin) ? origin : null;

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };

  if (allowed) headers['Access-Control-Allow-Origin'] = allowed;
  return headers;
}

/** True when an allowlist is configured and this request's origin is not on it. */
export function originBlocked(req: Request): boolean {
  const list = allowlist();
  if (list.length === 0) return false;
  const origin = req.headers.get('origin');
  if (!origin) return false; // same-origin / server-to-server calls send no Origin
  return !list.includes(origin.replace(/\/$/, ''));
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
