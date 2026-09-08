import { clientMetadata } from '@/oauth/client';

export const runtime = 'nodejs';

/**
 * The AT Protocol client metadata document.
 *
 * In atproto OAuth there is no app registration anywhere: this URL *is* the
 * client_id. Every PDS fetches this document to learn who we are, so it must
 * return 200 with application/json.
 */
export async function GET() {
  try {
    return Response.json(clientMetadata(), {
      headers: { 'Cache-Control': 'public, max-age=300' }
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
