/**
 * Bluesky API client.
 *
 * Authentication is OAuth only: an already-authenticated, DPoP-bound session is
 * bound onto an instance by src/oauth/adopt.ts before any tool runs. Nothing
 * here logs in, and no password ever reaches this class.
 *
 * Two call styles are used against the network:
 *   - typed namespaces (agent.getProfile, agent.post, ...) for the common cases
 *   - agent.call(nsid, params, data, opts) for lexicons with no typed helper
 *
 * `agent.api.xrpc.*` must not be used: it exists on the legacy password agent
 * but not on the OAuth one, and calling it throws "xrpc.get is not a function".
 *
 * Deliberately absent:
 *   - Account destruction (deactivate, delete). One-off, irreversible actions
 *     that belong in Bluesky's own settings, not in an agent's tool list.
 *   - Password and invite-code endpoints (createAppPassword, listAppPasswords,
 *     invite codes). bsky.social answers "OAuth credentials are not supported
 *     for this endpoint".
 *   - Admin lexicons (searchAccounts, sendEmail). bsky.social answers "Method
 *     Not Implemented"; they only exist on a self-hosted PDS.
 */

import { Agent, AppBskyFeedPost } from '@atproto/api';
import type {
  AuthenticatedSession,
  TimelineOptions,
  AuthorFeedOptions,
  FeedOptions,
  ThreadOptions,
  SearchActorsOptions,
  ProfileView,
  ActorSearchResult,
  FeedViewPost,
  ThreadViewPost,
  PostView,
  CreatePostResult,
  SearchPostsOptions,
  SearchPostsResult,
  ProcessedImage
} from './types';
import { formatError } from './utils';

const JSON_ENCODING = { encoding: 'application/json' } as const;

export class BlueskyClient {
  /** Set by bindOAuthSession(); never constructed here. */
  private agent!: Agent;
  private session: AuthenticatedSession | null = null;
  private isAuthenticated = false;

  /**
   * Check if client is authenticated
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated && this.session !== null;
  }

  /**
   * Get current session info (without sensitive tokens).
   */
  getSessionInfo(): { did?: string; handle?: string; authenticated: boolean } {
    return {
      did: this.session?.did,
      handle: this.session?.handle || undefined,
      authenticated: this.isAuthenticated
    };
  }

  /**
   * Resolve and cache the account's handle. OAuth gives us a DID only, so this
   * costs one profile lookup the first time it is needed.
   */
  async resolveHandle(): Promise<string | undefined> {
    if (!this.session) return undefined;
    if (this.session.handle) return this.session.handle;

    try {
      const profile = await this.getProfile(this.session.did);
      this.session.handle = profile.handle;
      return profile.handle;
    } catch {
      return undefined;
    }
  }

  /** Guard used by every authenticated call. */
  private requireAuth(): void {
    if (!this.isLoggedIn()) {
      throw new Error(
        'Not authenticated. Connect a Bluesky account through OAuth before calling this tool.'
      );
    }
  }

  /**
   * Call a lexicon that has no typed helper on the agent.
   */
  private async rpcGet<T = any>(nsid: string, params: Record<string, unknown> = {}): Promise<T> {
    const clean = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    );
    const res = await this.agent.call(nsid, clean);
    return res.data as T;
  }

  private async rpcPost<T = any>(nsid: string, body: Record<string, unknown> = {}): Promise<T> {
    const res = await this.agent.call(nsid, {}, body, JSON_ENCODING);
    return res.data as T;
  }

  /**
   * Make a request to a lexicon hosted on a service other than the PDS
   * (bookmarks, drafts, chat, age assurance).
   *
   * This implementation is replaced at runtime by bindOAuthSession(), which
   * substitutes a DPoP-signed fetch that proxies through the user's PDS to the
   * right service. The body here only runs if something calls the client
   * without binding a session first, so it fails loudly.
   */
  private async appviewRequest<T>(
    _nsid: string,
    _params?: Record<string, string | number | undefined | null>,
    _body?: Record<string, unknown>
  ): Promise<T> {
    throw new Error(
      'No OAuth session is bound to this client, so proxied requests cannot be signed.'
    );
  }

  /**
   * Upload an image blob to the user's PDS.
   */
  async uploadImage(data: Uint8Array, mimeType: string): Promise<unknown> {
    this.requireAuth();
    const res = await this.agent.uploadBlob(data, { encoding: mimeType });
    return res.data.blob;
  }

  /**
   * Upload a raw blob to the user's PDS.
   */
  async uploadBlob(data: Uint8Array, mimeType: string): Promise<unknown> {
    return this.uploadImage(data, mimeType);
  }

  /** Upload images and shape them into an embed object. */
  private async buildImageEmbed(images: ProcessedImage[]): Promise<Record<string, unknown>> {
    const uploaded = await Promise.all(
      images.map(async (img) => {
        const blob = await this.uploadImage(img.data, img.mimeType);
        const imageObj: Record<string, unknown> = { image: blob, alt: img.alt };
        if (img.aspectRatio) imageObj.aspectRatio = img.aspectRatio;
        return imageObj;
      })
    );
    return { $type: 'app.bsky.embed.images', images: uploaded };
  }

  /**
   * Create a new post
   */
  async createPost(
    text: string,
    options: {
      langs?: string[];
      reply?: { rootUri: string; rootCid: string; parentUri: string; parentCid: string };
      images?: ProcessedImage[];
    } = {}
  ): Promise<CreatePostResult> {
    this.requireAuth();

    try {
      const postRecord: AppBskyFeedPost.Record = {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: new Date().toISOString()
      };

      if (options.langs && options.langs.length > 0) {
        postRecord.langs = options.langs;
      }

      if (options.reply) {
        postRecord.reply = {
          root: { uri: options.reply.rootUri, cid: options.reply.rootCid },
          parent: { uri: options.reply.parentUri, cid: options.reply.parentCid }
        };
      }

      if (options.images && options.images.length > 0) {
        (postRecord as Record<string, unknown>).embed = await this.buildImageEmbed(options.images);
      }

      const result = await this.agent.post(postRecord);
      return { uri: result.uri, cid: result.cid };
    } catch (error) {
      throw new Error(`Failed to create post: ${formatError(error)}`);
    }
  }

  /**
   * Get user's timeline (home feed)
   */
  async getTimeline(
    options: TimelineOptions = {}
  ): Promise<{ feed: FeedViewPost[]; cursor?: string }> {
    this.requireAuth();

    try {
      const response = await this.agent.getTimeline({
        cursor: options.cursor,
        limit: options.limit
      });
      return {
        feed: response.data.feed as unknown as FeedViewPost[],
        cursor: response.data.cursor
      };
    } catch (error) {
      throw new Error(`Failed to get timeline: ${formatError(error)}`);
    }
  }

  /**
   * Get feed from a feed generator
   */
  async getFeed(options: FeedOptions): Promise<{ feed: FeedViewPost[]; cursor?: string }> {
    try {
      const response = await this.agent.app.bsky.feed.getFeed({
        feed: options.feed,
        cursor: options.cursor,
        limit: options.limit
      });
      return {
        feed: response.data.feed as unknown as FeedViewPost[],
        cursor: response.data.cursor
      };
    } catch (error) {
      throw new Error(`Failed to get feed: ${formatError(error)}`);
    }
  }

  /**
   * Get posts by a specific author
   */
  async getAuthorFeed(
    options: AuthorFeedOptions
  ): Promise<{ feed: FeedViewPost[]; cursor?: string }> {
    try {
      const response = await this.agent.getAuthorFeed({
        actor: options.actor,
        filter: options.filter,
        cursor: options.cursor,
        limit: options.limit
      });
      return {
        feed: response.data.feed as unknown as FeedViewPost[],
        cursor: response.data.cursor
      };
    } catch (error) {
      throw new Error(`Failed to get author feed: ${formatError(error)}`);
    }
  }

  /**
   * Get a post thread
   */
  async getPostThread(options: ThreadOptions): Promise<{ thread: ThreadViewPost }> {
    try {
      const response = await this.agent.getPostThread({
        uri: options.uri,
        depth: options.depth,
        parentHeight: options.parentHeight
      });
      return { thread: response.data.thread as unknown as ThreadViewPost };
    } catch (error) {
      throw new Error(`Failed to get thread: ${formatError(error)}`);
    }
  }

  /**
   * Get a user's profile
   */
  async getProfile(actor: string): Promise<ProfileView> {
    try {
      const response = await this.agent.getProfile({ actor });
      return response.data as ProfileView;
    } catch (error) {
      throw new Error(`Failed to get profile: ${formatError(error)}`);
    }
  }

  /**
   * Get multiple profiles
   */
  async getProfiles(actors: string[]): Promise<{ profiles: ProfileView[] }> {
    try {
      const response = await this.agent.getProfiles({ actors });
      return { profiles: response.data.profiles as ProfileView[] };
    } catch (error) {
      throw new Error(`Failed to get profiles: ${formatError(error)}`);
    }
  }

  /**
   * Search for actors (users)
   */
  async searchActors(options: SearchActorsOptions): Promise<{ actors: ActorSearchResult[] }> {
    try {
      const response = await this.agent.app.bsky.actor.searchActors({
        term: options.term,
        limit: options.limit
      });
      return { actors: response.data.actors as ActorSearchResult[] };
    } catch (error) {
      throw new Error(`Failed to search actors: ${formatError(error)}`);
    }
  }

  /**
   * Search for actors with typeahead (for autocomplete)
   */
  async searchActorsTypeahead(
    options: SearchActorsOptions
  ): Promise<{ actors: ActorSearchResult[] }> {
    try {
      const response = await this.agent.app.bsky.actor.searchActorsTypeahead({
        term: options.term,
        limit: options.limit
      });
      return { actors: response.data.actors as ActorSearchResult[] };
    } catch (error) {
      throw new Error(`Failed to search actors: ${formatError(error)}`);
    }
  }

  /**
   * Search posts by keyword
   */
  async searchPosts(options: SearchPostsOptions): Promise<SearchPostsResult> {
    try {
      const response = await this.agent.app.bsky.feed.searchPosts({
        q: options.q,
        cursor: options.cursor,
        limit: options.limit,
        sort: options.sort,
        mentions: options.mentions,
        author: options.author,
        lang: options.lang
      });
      return {
        posts: response.data.posts as unknown as PostView[],
        cursor: response.data.cursor
      };
    } catch (error) {
      throw new Error(`Failed to search posts: ${formatError(error)}`);
    }
  }

  /**
   * Get specific posts by URI
   */
  async getPosts(uris: string[]): Promise<{ posts: PostView[] }> {
    try {
      const response = await this.agent.getPosts({ uris });
      return { posts: response.data.posts as unknown as PostView[] };
    } catch (error) {
      throw new Error(`Failed to get posts: ${formatError(error)}`);
    }
  }

  /**
   * Get likes for a post
   */
  async getLikes(
    uri: string,
    cursor?: string,
    limit = 50
  ): Promise<{ likes: unknown[]; cursor?: string }> {
    try {
      const response = await this.agent.app.bsky.feed.getLikes({ uri, cursor, limit });
      return { likes: response.data.likes, cursor: response.data.cursor };
    } catch (error) {
      throw new Error(`Failed to get likes: ${formatError(error)}`);
    }
  }

  /**
   * Get reposted by for a post
   */
  async getRepostedBy(
    uri: string,
    cursor?: string,
    limit = 50
  ): Promise<{ repostedBy: ProfileView[]; cursor?: string }> {
    try {
      const response = await this.agent.app.bsky.feed.getRepostedBy({ uri, cursor, limit });
      return {
        repostedBy: response.data.repostedBy as ProfileView[],
        cursor: response.data.cursor
      };
    } catch (error) {
      throw new Error(`Failed to get reposted by: ${formatError(error)}`);
    }
  }

  /**
   * Like a post
   */
  async like(uri: string, cid: string): Promise<{ uri: string }> {
    this.requireAuth();
    try {
      const result = await this.agent.like(uri, cid);
      return { uri: result.uri };
    } catch (error) {
      throw new Error(`Failed to like post: ${formatError(error)}`);
    }
  }

  /**
   * Repost a post
   */
  async repost(uri: string, cid: string): Promise<{ uri: string }> {
    this.requireAuth();
    try {
      const result = await this.agent.repost(uri, cid);
      return { uri: result.uri };
    } catch (error) {
      throw new Error(`Failed to repost: ${formatError(error)}`);
    }
  }

  /**
   * Unlike a post by deleting the Like record.
   * The uri must be the like record URI returned from like().
   */
  async deleteLike(uri: string): Promise<void> {
    this.requireAuth();
    try {
      await this.agent.deleteLike(uri);
    } catch (error) {
      throw new Error(`Failed to unlike post: ${formatError(error)}`);
    }
  }

  /**
   * Un-repost a post by deleting the Repost record.
   * The uri must be the repost record URI returned from repost().
   */
  async deleteRepost(uri: string): Promise<void> {
    this.requireAuth();
    try {
      await this.agent.deleteRepost(uri);
    } catch (error) {
      throw new Error(`Failed to un-repost post: ${formatError(error)}`);
    }
  }

  /**
   * Test connectivity to Bluesky
   */
  async testConnectivity(): Promise<{ connected: boolean; error?: string }> {
    try {
      await this.rpcGet('com.atproto.server.describeServer');
      return { connected: true };
    } catch (error) {
      return { connected: false, error: formatError(error) };
    }
  }

  /**
   * Get suggested users to follow
   */
  async getSuggestions(limit = 10): Promise<{ actors: ActorSearchResult[] }> {
    this.requireAuth();
    try {
      const response = await this.agent.getSuggestions({ limit });
      return { actors: response.data.actors as ActorSearchResult[] };
    } catch (error) {
      throw new Error(`Failed to get suggestions: ${formatError(error)}`);
    }
  }

  /**
   * Get account preferences
   */
  async getPreferences(): Promise<{ preferences: unknown[] }> {
    this.requireAuth();
    try {
      const response = await this.agent.app.bsky.actor.getPreferences({});
      return { preferences: response.data.preferences };
    } catch (error) {
      throw new Error(`Failed to get preferences: ${formatError(error)}`);
    }
  }

  // Lexicons hosted off the PDS (bookmarks, drafts, chat, age assurance).
  // Proxied by the DPoP fetch that bindOAuthSession() installs.

  /**
   * Create a private bookmark for a post.
   */
  async createBookmark(uri: string, cid: string): Promise<{ id: string } | undefined> {
    this.requireAuth();
    try {
      return await this.appviewRequest<{ id: string }>(
        'app.bsky.bookmark.createBookmark',
        undefined,
        { uri, cid }
      );
    } catch (error) {
      throw new Error(`Failed to create bookmark: ${formatError(error)}`);
    }
  }

  /**
   * Delete a bookmark by URI
   */
  async deleteBookmark(uri: string): Promise<void> {
    this.requireAuth();
    try {
      await this.appviewRequest<void>('app.bsky.bookmark.deleteBookmark', undefined, { uri });
    } catch (error) {
      throw new Error(`Failed to delete bookmark: ${formatError(error)}`);
    }
  }

  /**
   * Get all private bookmarks for the account
   */
  async getBookmarks(
    cursor?: string,
    limit = 50
  ): Promise<{ bookmarks: unknown[]; cursor?: string }> {
    this.requireAuth();
    try {
      const result = await this.appviewRequest<{ bookmarks: unknown[]; cursor?: string }>(
        'app.bsky.bookmark.getBookmarks',
        { cursor, limit }
      );
      return result ?? { bookmarks: [] };
    } catch (error) {
      throw new Error(`Failed to get bookmarks: ${formatError(error)}`);
    }
  }

  /**
   * Get Age Assurance configuration for the account
   */
  async getAgeAssuranceConfig(): Promise<unknown> {
    this.requireAuth();
    try {
      return await this.appviewRequest<unknown>('app.bsky.ageassurance.getConfig');
    } catch (error) {
      throw new Error(`Failed to get age assurance config: ${formatError(error)}`);
    }
  }

  /**
   * Get current Age Assurance state for the account.
   * Requires an ISO 3166-1 alpha-2 country code.
   */
  async getAgeAssuranceState(countryCode: string): Promise<unknown> {
    this.requireAuth();
    try {
      return await this.appviewRequest<unknown>('app.bsky.ageassurance.getState', {
        countryCode
      });
    } catch (error) {
      throw new Error(`Failed to get age assurance state: ${formatError(error)}`);
    }
  }

  /**
   * Create a draft post.
   *
   * The lexicon's input shape is { draft: { posts: [{ text, ... }], langs? } },
   * not a flat { text, langs } body, so the single text/langs accepted here is
   * wrapped into a one-item draft.posts[] array before sending.
   */
  async createDraft(
    text: string,
    langs?: string[],
    images?: ProcessedImage[]
  ): Promise<{ id: string }> {
    this.requireAuth();
    try {
      const draftPost: Record<string, unknown> = { text };
      if (images && images.length > 0) {
        draftPost.embed = await this.buildImageEmbed(images);
      }

      const draft: Record<string, unknown> = { posts: [draftPost] };
      if (langs && langs.length > 0) draft.langs = langs;

      const result = await this.appviewRequest<{ id: string }>(
        'app.bsky.draft.createDraft',
        undefined,
        { draft }
      );
      if (!result) throw new Error('Empty response from createDraft');
      return result;
    } catch (error) {
      throw new Error(`Failed to create draft: ${formatError(error)}`);
    }
  }

  /**
   * Update an existing draft post
   */
  async updateDraft(
    id: string,
    text: string,
    langs?: string[],
    images?: ProcessedImage[]
  ): Promise<void> {
    this.requireAuth();
    try {
      const draftPost: Record<string, unknown> = { text };
      if (images && images.length > 0) {
        draftPost.embed = await this.buildImageEmbed(images);
      }

      const draftWithId: Record<string, unknown> = {
        id,
        draft: {
          posts: [draftPost],
          ...(langs && langs.length > 0 ? { langs } : {})
        }
      };

      await this.appviewRequest<void>('app.bsky.draft.updateDraft', undefined, {
        draft: draftWithId
      });
    } catch (error) {
      throw new Error(`Failed to update draft: ${formatError(error)}`);
    }
  }

  /**
   * Delete a draft by ID
   */
  async deleteDraft(id: string): Promise<void> {
    this.requireAuth();
    try {
      await this.appviewRequest<void>('app.bsky.draft.deleteDraft', undefined, { id });
    } catch (error) {
      throw new Error(`Failed to delete draft: ${formatError(error)}`);
    }
  }

  /**
   * Get drafts
   */
  async getDrafts(cursor?: string, limit = 50): Promise<{ drafts: unknown[]; cursor?: string }> {
    this.requireAuth();
    try {
      const result = await this.appviewRequest<{ drafts: unknown[]; cursor?: string }>(
        'app.bsky.draft.getDrafts',
        { cursor, limit }
      );
      return result ?? { drafts: [] };
    } catch (error) {
      throw new Error(`Failed to get drafts: ${formatError(error)}`);
    }
  }

  /**
   * Add a reaction to a chat message
   */
  async addReaction(convoId: string, messageId: string, value: string): Promise<unknown> {
    this.requireAuth();
    try {
      return await this.appviewRequest<unknown>('chat.bsky.convo.addReaction', undefined, {
        convoId,
        messageId,
        value
      });
    } catch (error) {
      throw new Error(`Failed to add reaction: ${formatError(error)}`);
    }
  }

  /**
   * Remove a reaction from a chat message
   */
  async removeReaction(convoId: string, messageId: string, value: string): Promise<unknown> {
    this.requireAuth();
    try {
      return await this.appviewRequest<unknown>('chat.bsky.convo.removeReaction', undefined, {
        convoId,
        messageId,
        value
      });
    } catch (error) {
      throw new Error(`Failed to remove reaction: ${formatError(error)}`);
    }
  }

  /**
   * Get messages in a conversation
   */
  async getMessages(
    convoId: string,
    cursor?: string,
    limit = 50
  ): Promise<{ messages: unknown[]; cursor?: string }> {
    this.requireAuth();
    try {
      const result = await this.appviewRequest<{ messages: unknown[]; cursor?: string }>(
        'chat.bsky.convo.getMessages',
        { convoId, cursor, limit }
      );
      return result ?? { messages: [] };
    } catch (error) {
      throw new Error(`Failed to get messages: ${formatError(error)}`);
    }
  }

  /**
   * Send a message in a conversation
   */
  async sendMessage(convoId: string, message: { text: string }): Promise<unknown> {
    this.requireAuth();
    try {
      return await this.appviewRequest<unknown>('chat.bsky.convo.sendMessage', undefined, {
        convoId,
        message
      });
    } catch (error) {
      throw new Error(`Failed to send message: ${formatError(error)}`);
    }
  }

  /**
   * Send a batch of messages to multiple conversations
   */
  async sendMessageBatch(
    items: Array<{ convoId: string; message: { text: string } }>
  ): Promise<unknown> {
    this.requireAuth();
    try {
      return await this.appviewRequest<unknown>('chat.bsky.convo.sendMessageBatch', undefined, {
        items
      });
    } catch (error) {
      throw new Error(`Failed to send message batch: ${formatError(error)}`);
    }
  }

  /**
   * Get message context for moderation
   */
  async getMessageContext(messageId: string): Promise<unknown> {
    this.requireAuth();
    try {
      return await this.appviewRequest<unknown>('chat.bsky.moderation.getMessageContext', {
        messageId
      });
    } catch (error) {
      throw new Error(`Failed to get message context: ${formatError(error)}`);
    }
  }

  // PDS lexicons without typed helpers.

  /**
   * Delete a post by URI or rkey
   */
  async deletePost(uriOrRkey: string): Promise<void> {
    this.requireAuth();

    let rkey: string;
    if (uriOrRkey.startsWith('at://')) {
      const match = uriOrRkey.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
      if (!match || !match[3]) {
        throw new Error('Invalid AT Protocol URI: missing rkey');
      }
      rkey = match[3];
    } else {
      rkey = uriOrRkey;
    }

    try {
      await this.rpcPost('com.atproto.repo.deleteRecord', {
        repo: this.session!.did,
        collection: 'app.bsky.feed.post',
        rkey
      });
    } catch (error) {
      throw new Error(`Failed to delete post: ${formatError(error)}`);
    }
  }

  /**
   * Update the email address on the account
   */
  async updateEmail(email: string, token?: string): Promise<void> {
    this.requireAuth();
    try {
      await this.rpcPost('com.atproto.server.updateEmail', {
        email,
        ...(token ? { token } : {})
      });
    } catch (error) {
      throw new Error(`Failed to update email: ${formatError(error)}`);
    }
  }

  /**
   * Confirm an email address using a token
   */
  async confirmEmail(email: string, token: string): Promise<void> {
    this.requireAuth();
    try {
      await this.rpcPost('com.atproto.server.confirmEmail', { email, token });
    } catch (error) {
      throw new Error(`Failed to confirm email: ${formatError(error)}`);
    }
  }

  /**
   * Describe the server
   */
  async describeServer(): Promise<unknown> {
    try {
      return await this.rpcGet('com.atproto.server.describeServer');
    } catch (error) {
      throw new Error(`Failed to describe server: ${formatError(error)}`);
    }
  }

  /**
   * Get a service auth token
   */
  async getServiceAuth(aud: string, lxm?: string, exp?: number): Promise<{ token: string }> {
    this.requireAuth();
    try {
      return await this.rpcGet('com.atproto.server.getServiceAuth', { aud, lxm, exp });
    } catch (error) {
      throw new Error(`Failed to get service auth: ${formatError(error)}`);
    }
  }

  /**
   * Get the current session
   */
  async getSession(): Promise<{ did: string; handle: string; email?: string }> {
    this.requireAuth();
    try {
      return await this.rpcGet('com.atproto.server.getSession');
    } catch (error) {
      throw new Error(`Failed to get session: ${formatError(error)}`);
    }
  }

  /**
   * Forget the bound session on this instance.
   *
   * This does not revoke anything upstream: OAuth tokens are owned by the
   * session store, and revoking them is the connected account's job, not a
   * per-request client's.
   */
  logout(): void {
    this.session = null;
    this.isAuthenticated = false;
  }
}

/**
 * Factory function to create a new Bluesky client instance.
 * A session must be bound with bindOAuthSession() before use.
 */
export function createBlueskyClient(): BlueskyClient {
  return new BlueskyClient();
}
