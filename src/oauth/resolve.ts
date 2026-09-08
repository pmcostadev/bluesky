import { Agent } from '@atproto/api';
import { getOAuthClient } from './client';
import { ACCESS_PREFIX, unseal } from './seal';

/**
 * A DPoP-capable session. Declared structurally rather than imported so this
 * module does not depend on which copy of the atproto packages npm resolved.
 * OAuthSession satisfies it.
 */
export type DpopSession = {
  did: string;
  fetchHandler(url: string, init?: RequestInit): Promise<Response>;
};

export type ResolvedAuth = {
  agent: Agent;
  session: DpopSession;
  did: string;
};

export class AuthError extends Error {}

/** Pull the bearer token off a request, if there is one. */
export function bearerOf(req: Request): string | undefined {
  const auth = req.headers.get('authorization');
  if (!auth) return undefined;
  if (!auth.toLowerCase().startsWith('bearer ')) return undefined;
  return auth.slice(7).trim() || undefined;
}

/**
 * Turn an incoming Authorization header into a live, DPoP-bound session.
 *
 * The access tokens we issue are opaque pointers: the Bluesky tokens and the
 * DPoP key they are bound to live in Redis, keyed by DID. restore() rotates
 * them when they are close to expiry, which is why this is async and why the
 * request lock in the store matters.
 */
export async function resolveAuth(token: string | undefined): Promise<ResolvedAuth> {
  if (!token) {
    throw new AuthError(
      'This server requires a Bluesky account connected through OAuth, and no credential was presented.'
    );
  }
  if (!token.startsWith(ACCESS_PREFIX)) {
    throw new AuthError(
      'That credential is not recognised. App passwords are no longer accepted; connect your Bluesky account through OAuth instead.'
    );
  }

  let did: string;
  try {
    ({ did } = unseal<{ did: string }>('access', token.slice(ACCESS_PREFIX.length)));
  } catch {
    throw new AuthError(
      'Your Bluesky sign-in has expired or is not valid. Reconnect the account to continue.'
    );
  }

  const oauth = await getOAuthClient();

  let session: DpopSession;
  try {
    session = (await oauth.restore(did)) as unknown as DpopSession;
  } catch (e) {
    throw new AuthError(
      `Could not restore the Bluesky session for ${did}. It may have been revoked or expired; reconnect the account. (${
        e instanceof Error ? e.message : String(e)
      })`
    );
  }

  return { agent: new Agent(session as never), session, did };
}
