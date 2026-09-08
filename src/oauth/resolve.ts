import { Agent } from '@atproto/api';
import { getOAuthClient } from './client';
import { ACCESS_PREFIX, unseal } from './seal';

/**
 * Turn an incoming Authorization header into a live, DPoP-bound Agent.
 *
 * Returns undefined when the request is not carrying one of our OAuth tokens,
 * which lets the caller fall back to app-password auth. Both paths stay live so
 * adding OAuth never breaks an existing connection.
 */
export async function agentFromBearer(token: string | undefined): Promise<Agent | undefined> {
  if (!token?.startsWith(ACCESS_PREFIX)) return undefined;

  let did: string;
  try {
    ({ did } = unseal<{ did: string }>('access', token.slice(ACCESS_PREFIX.length)));
  } catch {
    throw new Error(
      'Your Bluesky sign-in has expired or is not valid. Reconnect the account to continue.'
    );
  }

  const oauth = await getOAuthClient();

  // restore() refreshes the tokens if needed, using the stored DPoP key.
  const session = await oauth.restore(did).catch((e: unknown) => {
    throw new Error(
      `Could not restore the Bluesky session for ${did}. It may have been revoked; reconnect the account. (${
        e instanceof Error ? e.message : String(e)
      })`
    );
  });

  return new Agent(session);
}

/** True when the header looks like one of our OAuth access tokens. */
export function isOAuthBearer(token: string | undefined): boolean {
  return Boolean(token?.startsWith(ACCESS_PREFIX));
}
