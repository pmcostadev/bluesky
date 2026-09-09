import { corsHeaders, originBlocked, preflight } from '@/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Poll a Composio connection while the OAuth popup is open.
 *
 *   GET /api/connect/status?connectionId=ca_...
 *   GET /api/connect/status?userId=...
 *   GET /api/connect/status?connectionId=ca_...&userId=...   (preferred)
 *
 *   -> { status, connectionId, toolkit, resolvedBy }
 *
 * status follows Composio's lifecycle: INITIALIZING -> INITIATED -> ACTIVE, or
 * EXPIRED / FAILED. Only ACTIVE means the account is usable.
 *
 * ---
 * Why there are two lookup paths.
 *
 * The id returned when a link is created is not guaranteed to be the id the
 * connected account ends up with: depending on the endpoint and its version, the
 * response can carry a link-session id (lk_...) instead of a connected-account
 * id (ca_...). Polling a link id against /connected_accounts/{id} 404s forever,
 * and a client that treats "cannot determine status" as "not finished yet" then
 * spins indefinitely on a connection that is already ACTIVE. That is precisely
 * the failure this fallback exists to remove.
 *
 * So: try the direct lookup, and if it does not resolve, ask which accounts this
 * user has on this auth config and read the newest. Either way the caller gets a
 * real status.
 */

const BASE = 'https://backend.composio.dev/api/v3/connected_accounts';

type Lookup = { status: string; connectionId: string | null; toolkit: string | null } | null;

function pickStatus(row: Record<string, any> | undefined): string | null {
  if (!row) return null;
  const raw = row.status ?? row.state?.status;
  return typeof raw === 'string' && raw.trim() ? raw.trim().toUpperCase() : null;
}

async function byId(id: string, apiKey: string): Promise<Lookup> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    headers: { 'x-api-key': apiKey },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) return null;

  const data = (await res.json()) as Record<string, any>;
  const status = pickStatus(data);
  if (!status) return null;

  return { status, connectionId: data.id ?? id, toolkit: data.toolkit?.slug ?? null };
}

async function byUser(userId: string, apiKey: string): Promise<Lookup> {
  const url = new URL(BASE);
  url.searchParams.set('user_ids', userId);
  url.searchParams.set('order_by', 'created_at');
  url.searchParams.set('order_direction', 'desc');
  url.searchParams.set('limit', '5');

  const authConfigId = process.env.COMPOSIO_AUTH_CONFIG_ID;
  if (authConfigId) url.searchParams.set('auth_config_ids', authConfigId);

  const res = await fetch(url, {
    headers: { 'x-api-key': apiKey },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { items?: Record<string, any>[] };
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) return null;

  // An ACTIVE account anywhere in the recent set is the answer: a retried
  // connection can leave an abandoned INITIALIZING row ahead of the good one.
  const active = items.find((row) => pickStatus(row) === 'ACTIVE');
  const row = active ?? items[0];

  return {
    status: pickStatus(row) ?? 'UNKNOWN',
    connectionId: row.id ?? null,
    toolkit: row.toolkit?.slug ?? null
  };
}

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const cors = { ...corsHeaders(req), 'Cache-Control': 'no-store' };

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

  const q = new URL(req.url).searchParams;
  const id = q.get('connectionId')?.trim() || null;
  const userId = q.get('userId')?.trim() || null;

  if (!id && !userId) {
    return Response.json(
      { error: 'invalid_request', message: 'Pass connectionId, userId, or both.' },
      { status: 400, headers: cors }
    );
  }

  try {
    let found: Lookup = null;
    let resolvedBy: 'id' | 'user' | null = null;

    if (id && /^[A-Za-z0-9_-]{4,128}$/.test(id)) {
      found = await byId(id, apiKey);
      if (found) resolvedBy = 'id';
    }

    if (!found && userId) {
      found = await byUser(userId, apiKey);
      if (found) resolvedBy = 'user';
    }

    if (!found) {
      // Nothing to report yet. INITIALIZING keeps a polling client waiting
      // rather than telling it the connection failed.
      return Response.json(
        { status: 'INITIALIZING', connectionId: id, toolkit: null, resolvedBy: null },
        { headers: cors }
      );
    }

    return Response.json({ ...found, resolvedBy }, { headers: cors });
  } catch (e) {
    return Response.json(
      { error: 'request_failed', message: e instanceof Error ? e.message : String(e) },
      { status: 502, headers: cors }
    );
  }
}
