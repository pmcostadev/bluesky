import { corsHeaders, originBlocked, preflight } from '@/cors';

export const runtime = 'nodejs';

/**
 * Poll a Composio connection while the OAuth popup is open.
 *
 * GET /api/connect/status?connectionId=...
 *   -> { connectionId, status, toolkit }
 *
 * status follows Composio's lifecycle: INITIALIZING -> INITIATED -> ACTIVE,
 * or EXPIRED / FAILED. Only ACTIVE means the account is usable.
 */

const COMPOSIO_API = 'https://backend.composio.dev/api/v3/connected_accounts';

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const cors = corsHeaders(req);

  if (originBlocked(req)) {
    return Response.json(
      { error: 'origin_not_allowed', message: 'This origin is not on CONNECT_ALLOWED_ORIGINS.' },
      { status: 403, headers: cors }
    );
  }

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'not_configured', message: 'COMPOSIO_API_KEY is not set on this deployment.' },
      { status: 500, headers: cors }
    );
  }

  const id = new URL(req.url).searchParams.get('connectionId');
  if (!id || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) {
    return Response.json(
      { error: 'invalid_request', message: 'connectionId is required.' },
      { status: 400, headers: cors }
    );
  }

  try {
    const res = await fetch(`${COMPOSIO_API}/${encodeURIComponent(id)}`, {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000)
    });
    const text = await res.text();

    if (!res.ok) {
      return Response.json(
        { error: 'composio_error', status: res.status, detail: text.slice(0, 300) },
        { status: 502, headers: cors }
      );
    }

    let data: Record<string, any> = {};
    try {
      data = JSON.parse(text) as Record<string, any>;
    } catch {
      // keep a stable shape even if Composio returns something unexpected
    }

    return Response.json(
      {
        connectionId: data.id ?? id,
        status: data.status ?? data.state?.status ?? 'UNKNOWN',
        toolkit: data.toolkit?.slug ?? null
      },
      { headers: { ...cors, 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    return Response.json(
      { error: 'request_failed', message: e instanceof Error ? e.message : String(e) },
      { status: 502, headers: cors }
    );
  }
}
