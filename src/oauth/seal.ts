import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';

/**
 * Encrypted, self-describing blobs.
 *
 * Used for the values this server hands out (client_id, authorization code,
 * access token). Unlike the Product Hunt server, the Bluesky *session* itself
 * lives in Redis, because its refresh tokens rotate. What we seal here is only
 * a pointer to that session plus flow state.
 */

const ALGO = 'aes-256-gcm';

function key(): Buffer {
  const secret = process.env.OAUTH_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'OAUTH_SIGNING_SECRET is missing or too short. Set it to a random string of at least 32 characters.'
    );
  }
  return createHash('sha256').update(secret).digest();
}

export type Purpose = 'client' | 'code' | 'access' | 'state';

export function seal(purpose: Purpose, payload: Record<string, unknown>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify({ ...payload, p: purpose }), 'utf8'),
    cipher.final()
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export function unseal<T = Record<string, any>>(purpose: Purpose, token: string): T {
  let raw: Buffer;
  try {
    raw = Buffer.from(token, 'base64url');
  } catch {
    throw new Error('malformed token');
  }
  if (raw.length < 29) throw new Error('malformed token');

  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const body = raw.subarray(28);

  let json: string;
  try {
    const decipher = createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    json = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('token failed authentication');
  }

  const parsed = JSON.parse(json);
  if (parsed.p !== purpose) throw new Error('token used for the wrong purpose');
  if (typeof parsed.exp === 'number' && Date.now() > parsed.exp) {
    throw new Error('token expired');
  }
  return parsed as T;
}

/** RFC 7636 S256 verification. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  const computed = createHash('sha256').update(verifier, 'ascii').digest('base64url');
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function originOf(req: Request): string {
  const explicit = process.env.OAUTH_PUBLIC_ORIGIN;
  if (explicit) return explicit.replace(/\/$/, '');
  const h = req.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export const ACCESS_PREFIX = 'bsk_';
