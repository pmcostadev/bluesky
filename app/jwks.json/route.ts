import { publicJwks } from '@/oauth/client';

export const runtime = 'nodejs';

/** Public half of our signing keyset. Never contains private key material. */
export async function GET() {
  try {
    return Response.json(await publicJwks(), {
      headers: { 'Cache-Control': 'public, max-age=300' }
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
