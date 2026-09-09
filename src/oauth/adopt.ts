import type { Agent } from '@atproto/api';
import type { DpopSession } from './resolve';

/**
 * Bridge between an atproto OAuth session and the existing BlueskyClient.
 *
 * BlueskyClient was written around app-password auth: it logged in, kept the
 * returned JWTs, and sent them as plain bearer tokens. OAuth sessions cannot
 * work that way, because every request must be signed with the DPoP key the
 * tokens are bound to.
 *
 * Rather than fork the client, this adapter swaps two things on an existing
 * instance:
 *
 *   1. the internal agent, replaced with the DPoP-bound OAuth Agent, which
 *      covers every tool that goes through `agent.*` (the large majority), and
 *   2. the service-proxy escape hatch, replaced with a DPoP fetch that proxies
 *      through the user's PDS for lexicons the PDS does not host itself
 *      (bookmarks, drafts, chat, age assurance).
 *
 * The fields being written are private to BlueskyClient, so the casts here are
 * deliberate and confined to this file: it is the one seam where the two auth
 * models meet.
 */

/** The AppView's service DID: bookmarks, drafts, age assurance. */
export const APPVIEW_PROXY = 'did:web:api.bsky.app#bsky_appview';

/**
 * The chat service's DID. DMs live on a separate service from the AppView, and
 * proxying chat.bsky.* to the AppView fails with a missing-scope error, so the
 * target is chosen per lexicon.
 */
export const CHAT_PROXY = 'did:web:api.bsky.chat#bsky_chat';

/** Pick the right service DID for a lexicon. */
export function proxyFor(nsid: string): string {
  return nsid.startsWith('chat.bsky.') ? CHAT_PROXY : APPVIEW_PROXY;
}

type ClientInternals = {
  agent: unknown;
  session: { accessJwt: string; refreshJwt: string; did: string; handle: string } | null;
  isAuthenticated: boolean;
  appviewRequest: (
    nsid: string,
    params?: Record<string, string | number | undefined | null>,
    body?: Record<string, unknown>
  ) => Promise<unknown>;
};

/**
 * Point an existing BlueskyClient at an OAuth session.
 *
 * `handle` is optional: the DID is the stable identifier and the only thing the
 * client actually needs. The handle is resolved on demand by resolveHandle().
 */
export function bindOAuthSession(
  client: object,
  agent: Agent,
  session: DpopSession,
  handle = ''
): void {
  const internals = client as unknown as ClientInternals;

  internals.agent = agent;
  internals.isAuthenticated = true;
  internals.session = {
    // No JWTs are exposed by an OAuth session, and nothing should read these:
    // every authenticated call now goes through the DPoP-bound agent instead.
    accessJwt: '',
    refreshJwt: '',
    did: session.did,
    handle
  };

  internals.appviewRequest = async (nsid, params, body) => {
    const search = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) search.set(key, String(value));
      }
    }

    const query = search.toString();
    const path = `/xrpc/${nsid}${query ? `?${query}` : ''}`;

    const res = await session.fetchHandler(path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Ask the PDS to forward this to whichever service hosts the lexicon.
        'atproto-proxy': proxyFor(nsid)
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!res.ok) {
      let message = `Request to ${nsid} failed: ${res.status} ${res.statusText}`;
      try {
        const err = (await res.json()) as { message?: string; error?: string };
        if (err?.message) message = err.message;
        else if (err?.error) message = err.error;
      } catch {
        // response body was not JSON; keep the status-based message
      }
      throw new Error(message);
    }

    const text = await res.text();
    return text.trim().length === 0 ? undefined : JSON.parse(text);
  };
}
