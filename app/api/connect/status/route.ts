export const runtime = 'nodejs';

const COMPOSIO_API = 'https://backend.composio.dev/api/v3/connected_accounts';

export async function GET(req: Request) {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'not_configured', message: 'COMPOSIO_API_KEY is not set on this deployment.' },
      { status: 500 }
    );
  }

  const id = new URL(req.url).searchParams.get('connectionId');
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return Response.json(
      { error: 'invalid_request', message: 'connectionId is required.' },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${COMPOSIO_API}/${encodeURIComponent(id)}`, {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000)
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Preserve a stable error response even if Composio returns non-JSON.
    }

    if (!res.ok) {
      return Response.json(
        { error: 'composio_error', status: res.status, detail: text.slice(0, 300) },
        { status: 502 }
      );
    }

    return Response.json({
      connectionId: data.id ?? id,
      status: data.status ?? (data.state as Record<string, unknown> | undefined)?.status ?? 'UNKNOWN',
      toolkit: (data.toolkit as Record<string, unknown> | undefined)?.slug ?? null
    });
  } catch (e) {
    return Response.json(
      { error: 'request_failed', message: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
