/**
 * Redis-backed stores for AT Protocol OAuth.
 *
 * Bluesky's refresh tokens are single-use and rotate on every refresh, so
 * sessions cannot live inside the token the way Product Hunt's could. They need
 * real storage. This uses the Upstash REST API directly (no SDK dependency) so
 * it works on Vercel's Node runtime with just two env vars.
 */

type Json = Record<string, unknown>;

function config(): { url: string; token: string } {
  const url =
    process.env.KV_REST_API_URL ??
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Session storage is not configured. Add a Redis/KV store to this Vercel project so it provides KV_REST_API_URL and KV_REST_API_TOKEN.'
    );
  }
  return { url: url.replace(/\/$/, ''), token };
}

async function command<T = unknown>(args: (string | number)[]): Promise<T> {
  const { url, token } = config();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000)
  });

  if (!res.ok) {
    throw new Error(`Session storage error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as { result?: T; error?: string };
  if (body.error) throw new Error(`Session storage error: ${body.error}`);
  return body.result as T;
}

export async function kvGet<T = Json>(key: string): Promise<T | undefined> {
  const raw = await command<string | null>(['GET', key]);
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const payload = JSON.stringify(value);
  if (ttlSeconds && ttlSeconds > 0) {
    await command(['SET', key, payload, 'EX', Math.floor(ttlSeconds)]);
  } else {
    await command(['SET', key, payload]);
  }
}

export async function kvDel(key: string): Promise<void> {
  await command(['DEL', key]);
}

/**
 * Every key matching a glob pattern.
 *
 * Uses SCAN rather than KEYS so it stays safe on a shared instance, and pages
 * until the cursor returns to 0.
 */
export async function kvKeys(pattern: string): Promise<string[]> {
  const found = new Set<string>();
  let cursor = '0';

  do {
    const [next, batch] = await command<[string, string[]]>([
      'SCAN',
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      100
    ]);
    for (const key of batch ?? []) found.add(key);
    cursor = next;
  } while (cursor !== '0' && found.size < 1000);

  return Array.from(found);
}

/** Best-effort lock so two concurrent refreshes don't race a single-use token. */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const lockKey = `lock:${key}`;
  const deadline = Date.now() + 8_000;

  for (;;) {
    const acquired = await command<string | number | null>(['SET', lockKey, '1', 'NX', 'EX', 15]);
    if (acquired) break;
    if (Date.now() > deadline) break; // proceed rather than fail the request outright
    await new Promise((r) => setTimeout(r, 120));
  }

  try {
    return await fn();
  } finally {
    await command(['DEL', lockKey]).catch(() => {});
  }
}

export const KEYS = {
  state: (k: string) => `bsky:state:${k}`,
  session: (did: string) => `bsky:session:${did}`,
  pending: (k: string) => `bsky:pending:${k}`,
  sessionPattern: 'bsky:session:*'
};
