/**
 * Bluesky API Client with Secure Credential Management
 * Credentials are injected externally via headers - never stored in env
 */

import { BskyAgent, AppBskyFeedPost } from '@atproto/api';
import type {
  BlueskyCredentials,
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
  SearchAccountsInput,
  ProcessedImage
} from './types';
import { formatError } from './utils';

export class BlueskyClient {
  private agent: BskyAgent;
  private session: AuthenticatedSession | null = null;
  private readonly serviceUrl: string;
  private isAuthenticated = false;
  private readonly APPVIEW_URL = 'https://api.bsky.app';

  constructor(serviceUrl = 'https://bsky.social') {
    this.serviceUrl = serviceUrl;
    this.agent = new BskyAgent({ service: serviceUrl });
  }

  /**
   * Authenticate with Bluesky using externally provided credentials
   * Credentials are NEVER stored - only held in memory for the session
   */
  async authenticate(credentials: BlueskyCredentials): Promise<AuthenticatedSession> {
    try {
      await this.agent.login({
        identifier: credentials.identifier,
        password: credentials.password
      });

      // Get session details
      const sessionData = this.agent.session;

      if (!sessionData) {
        throw new Error('Failed to establish session');
      }

      this.session = {
        accessJwt: sessionData.accessJwt,
        refreshJwt: sessionData.refreshJwt,
        did: sessionData.did,
        handle: sessionData.handle
      };

      this.isAuthenticated = true;
      return this.session;
    } catch (error) {
      this.isAuthenticated = false;
      throw new Error(`Authentication failed: ${formatError(error)}`);
    }
  }

  /**
   * Check if client is authenticated
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated && this.session !== null;
  }

  /**
   * Get current session info (without sensitive tokens)
   */
  getSessionInfo(): { did?: string; handle?: string; authenticated: boolean } {
    return {
      did: this.session?.did,
      handle: this.session?.handle,
      authenticated: this.isAuthenticated
    };
  }

  /**
   * Make a direct request to the Bluesky AppView (api.bsky.app)
   * Used for lexicons that the PDS does not support proxying.
   */
  private async appviewRequest<T>(
    nsid: string,
    params?: Record<string, string | number | undefined | null>,
    body?: Record<string, unknown>
  ): Promise<T> {
    if (!this.isLoggedIn() || !this.session) {
      throw new Error('Not authenticated');
    }

    const url = new URL(`${this.APPVIEW_URL}/xrpc/${nsid}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url.toString(), {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.session.accessJwt}`
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      let message = `AppView request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = (await response.json()) as { message?: string; error?: string };
        if (errorData?.message) {
          message = errorData.message;
        } else if (errorData?.error) {
          message = errorData.error;
        }
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(message);
    }

    const text = await response.text();
    if (text.trim().length === 0) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  /**
   * Upload an image blob to the user's PDS.
   */
  async uploadImage(data: Uint8Array, mimeType: string): Promise<unknown> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }
    const res = await this.agent.uploadBlob(data, { encoding: mimeType });
    return res.data.blob;
  }

  /**
   * Upload a raw blob to the user's PDS.
   * Returns the blob reference that can be used in record embeds.
   */
  async uploadBlob(data: Uint8Array, mimeType: string): Promise<unknown> {
    return this.uploadImage(data, mimeType);
  }

  /**
   * Create a new post
   */
  async createPost(
    text: string,
    options: {
      langs?: string[];
      reply?: {
        rootUri: string;
        rootCid: string;
        parentUri: string;
        parentCid: string;
      };
      images?: ProcessedImage[];
    } = {}
  ): Promise<CreatePostResult> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

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
        const images = await Promise.all(
          options.images.map(async (img) => {
            const blob = await this.uploadImage(img.data, img.mimeType);
            const imageObj: Record<string, unknown> = {
              image: blob,
              alt: img.alt
            };
            if (img.aspectRatio) {
              imageObj.aspectRatio = img.aspectRatio;
            }
            return imageObj;
          })
        );
        (postRecord as Record<string, unknown>).embed = {
          $type: 'app.bsky.embed.images',
          images
        };
      }

      const result = await this.agent.post(postRecord);

      return {
        uri: result.uri,
        cid: result.cid
      };
    } catch (error) {
      throw new Error(`Failed to create post: ${formatError(error)}`);
    }
  }

  /**
   * Get user's timeline (home feed)
   */
  async getTimeline(options: TimelineOptions = {}): Promise<{ feed: FeedViewPost[]; cursor?: string }> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

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
  async getAuthorFeed(options: AuthorFeedOptions): Promise<{ feed: FeedViewPost[]; cursor?: string }> {
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

      return {
        thread: response.data.thread as unknown as ThreadViewPost
      };
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
   * Search for actors (users) - for AI search engine functionality
   */
  async searchActors(options: SearchActorsOptions): Promise<{ actors: ActorSearchResult[] }> {
    try {
      // Use public API for search (no auth required)
      const response = await this.agent.app.bsky.actor.searchActors({
        term: options.term,
        limit: options.limit
      });

      return {
        actors: response.data.actors as ActorSearchResult[]
      };
    } catch (error) {
      throw new Error(`Failed to search actors: ${formatError(error)}`);
    }
  }

  /**
   * Search for actors with typeahead (for autocomplete)
   */
  async searchActorsTypeahead(options: SearchActorsOptions): Promise<{ actors: ActorSearchResult[] }> {
    try {
      const response = await this.agent.app.bsky.actor.searchActorsTypeahead({
        term: options.term,
        limit: options.limit
      });

      return {
        actors: response.data.actors as ActorSearchResult[]
      };
    } catch (error) {
      throw new Error(`Failed to search actors: ${formatError(error)}`);
    }
  }

  /**
   * Search posts by keyword - core AI search engine functionality
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
  async getLikes(uri: string, cursor?: string, limit = 50): Promise<{ likes: unknown[]; cursor?: string }> {
    try {
      const response = await this.agent.app.bsky.feed.getLikes({ uri, cursor, limit });
      return {
        likes: response.data.likes,
        cursor: response.data.cursor
      };
    } catch (error) {
      throw new Error(`Failed to get likes: ${formatError(error)}`);
    }
  }

  /**
   * Get reposted by for a post
   */
  async getRepostedBy(uri: string, cursor?: string, limit = 50): Promise<{ repostedBy: ProfileView[]; cursor?: string }> {
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
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

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
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const result = await this.agent.repost(uri, cid);
      return { uri: result.uri };
    } catch (error) {
      throw new Error(`Failed to repost: ${formatError(error)}`);
    }
  }

  /**
   * Unlike a post by deleting the Like record (requires auth).
   * The uri must be the like record URI returned from like(), e.g.
   * at://did:plc:.../app.bsky.feed.like/rkey — not the original post URI.
   */
  async deleteLike(uri: string): Promise<void> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      await this.agent.deleteLike(uri);
    } catch (error) {
      throw new Error(`Failed to unlike post: ${formatError(error)}`);
    }
  }

  /**
   * Un-repost a post by deleting the Repost record (requires auth).
   * The uri must be the repost record URI returned from repost(), e.g.
   * at://did:plc:.../app.bsky.feed.repost/rkey — not the original post URI.
   */
  async deleteRepost(uri: string): Promise<void> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

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
      await this.agent.com.atproto.server.describeServer({});
      return { connected: true };
    } catch (error) {
      return {
        connected: false,
        error: formatError(error)
      };
    }
  }

  /**
   * Get suggested users to follow
   */
  async getSuggestions(limit = 10): Promise<{ actors: ActorSearchResult[] }> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.agent.getSuggestions({ limit });
      return {
        actors: response.data.actors as ActorSearchResult[]
      };
    } catch (error) {
      throw new Error(`Failed to get suggestions: ${formatError(error)}`);
    }
  }

  /**
   * Get account preferences (requires auth)
   */
  async getPreferences(): Promise<{ preferences: unknown[] }> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.agent.app.bsky.actor.getPreferences({});
      return { preferences: response.data.preferences };
    } catch (error) {
      throw new Error(`Failed to get preferences: ${formatError(error)}`);
    }
  }

  /**
   * Create a private bookmark for a post (requires auth)
   * Only app.bsky.feed.post records are supported
   */
  async createBookmark(uri: string, cid: string): Promise<{ id: string } | undefined> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

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
   * Delete a bookmark by URI (requires auth)
   */
  async deleteBookmark(uri: string): Promise<void> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      await this.appviewRequest<void>(
        'app.bsky.bookmark.deleteBookmark',
        undefined,
        { uri }
      );
    } catch (error) {
      throw new Error(`Failed to delete bookmark: ${formatError(error)}`);
    }
  }

  /**
   * Get all private bookmarks for the account (requires auth)
   */
  async getBookmarks(cursor?: string, limit = 50): Promise<{ bookmarks: unknown[]; cursor?: string }> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

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
   * Initiate Age Assurance flow for the account (requires auth)
   */
  async beginAgeAssurance(): Promise<unknown> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      return await this.appviewRequest<unknown>(
        'app.bsky.ageassurance.begin',
        undefined,
        {}
      );
    } catch (error) {
      throw new Error(`Failed to begin age assurance: ${formatError(error)}`);
    }
  }

  /**
   * Get Age Assurance configuration for the account (requires auth)
   */
  async getAgeAssuranceConfig(): Promise<unknown> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      return await this.appviewRequest<unknown>('app.bsky.ageassurance.getConfig');
    } catch (error) {
      throw new Error(`Failed to get age assurance config: ${formatError(error)}`);
    }
  }

  /**
   * Get current Age Assurance state/status for the account (requires auth)
   */
  async getAgeAssuranceState(): Promise<unknown> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      return await this.appviewRequest<unknown>('app.bsky.ageassurance.getState');
    } catch (error) {
      throw new Error(`Failed to get age assurance state: ${formatError(error)}`);
    }
  }

  /**
   * Delete a post by URI or rkey (requires auth)
   */
  async deletePost(uriOrRkey: string): Promise<void> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.agent.api as any).xrpc.call(
        'com.atproto.repo.deleteRecord',
        {},
        {
          repo: this.session!.did,
          collection: 'app.bsky.feed.post',
          rkey
        },
        { encoding: 'application/json' }
      );
    } catch (error) {
      throw new Error(`Failed to delete post: ${formatError(error)}`);
    }
  }

  /**
   * Create a draft post (requires auth).
   *
   * Routed through appviewRequest() rather than agent.api.xrpc.call(), because
   * app.bsky.draft.* is a "private storage / stash" lexicon hosted on the
   * AppView (api.bsky.app) — the same family as app.bsky.bookmark.* and
   * app.bsky.ageassurance.*. Calling it through the PDS-bound agent.api.xrpc
   * client throws "Lexicon not found", exactly like the bookmark endpoints
   * did before they were switched to appviewRequest().
   *
   * The lexicon's input shape is { draft: { posts: [{ text, ... }], langs? } } —
   * not a flat { text, langs } body — so the single text/langs we accept here
   * is wrapped into a one-item draft.posts[] array before sending.
   */
  async createDraft(text: string, langs?: string[], images?: ProcessedImage[]): Promise<{ id: string }> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const draftPost: Record<string, unknown> = { text };

      if (images && images.length > 0) {
        const uploadedImages = await Promise.all(
          images.map(async (img) => {
            const blob = await this.uploadImage(img.data, img.mimeType);
            const imageObj: Record<string, unknown> = {
              image: blob,
              alt: img.alt
            };
            if (img.aspectRatio) {
              imageObj.aspectRatio = img.aspectRatio;
            }
            return imageObj;
          })
        );
        draftPost.embed = {
          $type: 'app.bsky.embed.images',
          images: uploadedImages
        };
      }

      const draft: Record<string, unknown> = {
        posts: [draftPost]
      };

      if (langs && langs.length > 0) {
        draft.langs = langs;
      }

      const result = await this.appviewRequest<{ id: string }>(
        'app.bsky.draft.createDraft',
        undefined,
        { draft }
      );

      if (!result) {
        throw new Error('Empty response from createDraft');
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to create draft: ${formatError(error)}`);
    }
  }

  /**
   * Update an existing draft post (requires auth).
   * Routed through appviewRequest() — see createDraft() for why app.bsky.draft.*
   * must go to the AppView (api.bsky.app) instead of the PDS.
   */
  async updateDraft(id: string, text: string, langs?: string[], images?: ProcessedImage[]): Promise<void> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const draftPost: Record<string, unknown> = { text };

      if (images && images.length > 0) {
        const uploadedImages = await Promise.all(
          images.map(async (img) => {
            const blob = await this.uploadImage(img.data, img.mimeType);
            const imageObj: Record<string, unknown> = {
              image: blob,
              alt: img.alt
            };
            if (img.aspectRatio) {
              imageObj.aspectRatio = img.aspectRatio;
            }
            return imageObj;
          })
        );
        draftPost.embed = {
          $type: 'app.bsky.embed.images',
          images: uploadedImages
        };
      }

      const draftWithId: Record<string, unknown> = {
        id,
        draft: {
          posts: [draftPost],
          ...(langs && langs.length > 0 ? { langs } : {})
        }
      };

      await this.appviewRequest<void>(
        'app.bsky.draft.updateDraft',
        undefined,
        { draft: draftWithId }
      );
    } catch (error) {
      throw new Error(`Failed to update draft: ${formatError(error)}`);
    }
  }

  /**
   * Delete a draft by ID (requires auth).
   * Routed through appviewRequest() — see createDraft() for why app.bsky.draft.*
   * must go to the AppView (api.bsky.app) instead of the PDS.
   */
  async deleteDraft(id: string): Promise<void> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      await this.appviewRequest<void>(
        'app.bsky.draft.deleteDraft',
        undefined,
        { id }
      );
    } catch (error) {
      throw new Error(`Failed to delete draft: ${formatError(error)}`);
    }
  }

  /**
   * Get drafts (requires auth).
   * Routed through appviewRequest() — see createDraft() for why app.bsky.draft.*
   * must go to the AppView (api.bsky.app) instead of the PDS.
   */
  async getDrafts(cursor?: string, limit = 50): Promise<{ drafts: unknown[]; cursor?: string }> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

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
   * Search accounts via admin endpoint (requires auth)
   */
  async searchAccounts(options: SearchAccountsInput): Promise<{ accounts: unknown[]; cursor?: string }> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.agent.api as any).xrpc.get(
        'com.atproto.admin.searchAccounts',
        {
          email: options.email,
          cursor: options.cursor,
          limit: options.limit
        }
      );
      return {
        accounts: response.data.accounts ?? [],
        cursor: response.data.cursor
      };
    } catch (error) {
      throw new Error(`Failed to search accounts: ${formatError(error)}`);
    }
  }

  /**
   * Add a reaction to a chat message (requires auth)
   */
  async addReaction(convoId: string, messageId: string, value: string): Promise<unknown> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      return await this.appviewRequest<unknown>(
        'chat.bsky.convo.addReaction',
        undefined,
        { convoId, messageId, value }
      );
    } catch (error) {
      throw new Error(`Failed to add reaction: ${formatError(error)}`);
    }
  }

  /**
   * Remove a reaction from a chat message (requires auth)
   */
  async removeReaction(convoId: string, messageId: string, value: string): Promise<unknown> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      return await this.appviewRequest<unknown>(
        'chat.bsky.convo.removeReaction',
        undefined,
        { convoId, messageId, value }
      );
    } catch (error) {
      throw new Error(`Failed to remove reaction: ${formatError(error)}`);
    }
  }

  /**
   * Get messages in a conversation (requires auth)
   */
  async getMessages(convoId: string, cursor?: string, limit = 50): Promise<{ messages: unknown[]; cursor?: string }> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

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
   * Send a message in a conversation (requires auth)
   */
  async sendMessage(convoId: string, message: { text: string }): Promise<unknown> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      return await this.appviewRequest<unknown>(
        'chat.bsky.convo.sendMessage',
        undefined,
        { convoId, message }
      );
    } catch (error) {
      throw new Error(`Failed to send message: ${formatError(error)}`);
    }
  }

  /**
   * Send a batch of messages to multiple conversations (requires auth)
   */
  async sendMessageBatch(items: Array<{ convoId: string; message: { text: string } }>): Promise<unknown> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      return await this.appviewRequest<unknown>(
        'chat.bsky.convo.sendMessageBatch',
        undefined,
        { items }
      );
    } catch (error) {
      throw new Error(`Failed to send message batch: ${formatError(error)}`);
    }
  }

  /**
   * Get message context for moderation (requires auth)
   */
  async getMessageContext(messageId: string): Promise<unknown> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      return await this.appviewRequest<unknown>(
        'chat.bsky.moderation.getMessageContext',
        { messageId }
      );
    } catch (error) {
      throw new Error(`Failed to get message context: ${formatError(error)}`);
    }
  }

  /**
   * Update the email address on the account (requires auth)
   */
  async updateEmail(email: string, token?: string): Promise<void> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const body: Record<string, unknown> = { email };
      if (token) {
        body.token = token;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.agent.api as any).xrpc.call(
        'com.atproto.server.updateEmail',
        {},
        body,
        { encoding: 'application/json' }
      );
    } catch (error) {
      throw new Error(`Failed to update email: ${formatError(error)}`);
    }
  }

  /**
   * Send an email as an admin (requires auth + admin privileges)
   */
  async adminSendEmail(
    recipientDid: string,
    content: string,
    subject?: string,
    senderDid?: string,
    comment?: string
  ): Promise<unknown> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const body: Record<string, unknown> = { recipientDid, content };
      if (subject) body.subject = subject;
      if (senderDid) body.senderDid = senderDid;
      if (comment) body.comment = comment;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.agent.api as any).xrpc.call(
        'com.atproto.server.sendEmail',
        {},
        body,
        { encoding: 'application/json' }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to send admin email: ${formatError(error)}`);
    }
  }

  /**
   * Confirm an email address using a token (requires auth)
   */
  async confirmEmail(email: string, token: string): Promise<void> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.agent.api as any).xrpc.call(
        'com.atproto.server.confirmEmail',
        {},
        { email, token },
        { encoding: 'application/json' }
      );
    } catch (error) {
      throw new Error(`Failed to confirm email: ${formatError(error)}`);
    }
  }

  /**
   * Create a new account (no auth required)
   */
  async createAccount(
    email: string,
    handle: string,
    password: string,
    inviteCode?: string,
    verificationCode?: string,
    verificationPhone?: string,
    plcOp?: Record<string, unknown>
  ): Promise<{ did: string; handle: string; accessJwt: string; refreshJwt: string }> {
    try {
      const body: Record<string, unknown> = { email, handle, password };
      if (inviteCode) body.inviteCode = inviteCode;
      if (verificationCode) body.verificationCode = verificationCode;
      if (verificationPhone) body.verificationPhone = verificationPhone;
      if (plcOp) body.plcOp = plcOp;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.agent.api as any).xrpc.call(
        'com.atproto.server.createAccount',
        {},
        body,
        { encoding: 'application/json' }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create account: ${formatError(error)}`);
    }
  }

  /**
   * Create an app password (requires auth)
   */
  async createAppPassword(name: string): Promise<unknown> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.agent.api as any).xrpc.call(
        'com.atproto.server.createAppPassword',
        {},
        { name },
        { encoding: 'application/json' }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create app password: ${formatError(error)}`);
    }
  }

  /**
   * Create an invite code (requires auth)
   */
  async createInviteCode(forAccount?: string, useCount?: number): Promise<{ code: string }> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const body: Record<string, unknown> = {};
      if (forAccount) body.forAccount = forAccount;
      if (useCount !== undefined) body.useCount = useCount;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.agent.api as any).xrpc.call(
        'com.atproto.server.createInviteCode',
        {},
        body,
        { encoding: 'application/json' }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create invite code: ${formatError(error)}`);
    }
  }

  /**
   * Create multiple invite codes (requires auth)
   */
  async createInviteCodes(
    codeCount?: number,
    useCount?: number,
    forAccounts?: string[]
  ): Promise<{ codes: { account: string; code: string }[] }> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const body: Record<string, unknown> = {};
      if (codeCount !== undefined) body.codeCount = codeCount;
      if (useCount !== undefined) body.useCount = useCount;
      if (forAccounts) body.forAccounts = forAccounts;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.agent.api as any).xrpc.call(
        'com.atproto.server.createInviteCodes',
        {},
        body,
        { encoding: 'application/json' }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create invite codes: ${formatError(error)}`);
    }
  }

  /**
   * Create a session (no auth required)
   */
  async createSession(
    identifier: string,
    password: string,
    authFactorToken?: string
  ): Promise<{ did: string; handle: string; email?: string; accessJwt: string; refreshJwt: string }> {
    try {
      const body: Record<string, unknown> = { identifier, password };
      if (authFactorToken) body.authFactorToken = authFactorToken;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.agent.api as any).xrpc.call(
        'com.atproto.server.createSession',
        {},
        body,
        { encoding: 'application/json' }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create session: ${formatError(error)}`);
    }
  }

  /**
   * Deactivate an account (requires auth)
   */
  async deactivateAccount(deleteAfter?: string): Promise<void> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const body: Record<string, unknown> = {};
      if (deleteAfter) body.deleteAfter = deleteAfter;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.agent.api as any).xrpc.call(
        'com.atproto.server.deactivateAccount',
        {},
        body,
        { encoding: 'application/json' }
      );
    } catch (error) {
      throw new Error(`Failed to deactivate account: ${formatError(error)}`);
    }
  }

  /**
   * Delete an account (requires auth)
   */
  async deleteAccount(password: string): Promise<void> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.agent.api as any).xrpc.call(
        'com.atproto.server.deleteAccount',
        {},
        { password },
        { encoding: 'application/json' }
      );
    } catch (error) {
      throw new Error(`Failed to delete account: ${formatError(error)}`);
    }
  }

  /**
   * Delete the current session (requires auth)
   */
  async deleteSession(): Promise<void> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.agent.api as any).xrpc.call(
        'com.atproto.server.deleteSession',
        {},
        {},
        { encoding: 'application/json' }
      );
    } catch (error) {
      throw new Error(`Failed to delete session: ${formatError(error)}`);
    }
  }

  /**
   * Describe the server (no auth required)
   */
  async describeServer(): Promise<unknown> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.agent.api as any).xrpc.get('com.atproto.server.describeServer', {});
      return response.data;
    } catch (error) {
      throw new Error(`Failed to describe server: ${formatError(error)}`);
    }
  }

  /**
   * Get account invite codes (requires auth)
   */
  async getAccountInviteCodes(includeUsed?: boolean, createAvailable?: boolean): Promise<unknown> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const params: Record<string, unknown> = {};
      if (includeUsed !== undefined) params.includeUsed = includeUsed;
      if (createAvailable !== undefined) params.createAvailable = createAvailable;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.agent.api as any).xrpc.get(
        'com.atproto.server.getAccountInviteCodes',
        params
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get account invite codes: ${formatError(error)}`);
    }
  }

  /**
   * Get a service auth token (requires auth)
   */
  async getServiceAuth(aud: string, lxm?: string, exp?: number): Promise<{ token: string }> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const params: Record<string, unknown> = { aud };
      if (lxm) params.lxm = lxm;
      if (exp !== undefined) params.exp = exp;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.agent.api as any).xrpc.get(
        'com.atproto.server.getServiceAuth',
        params
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get service auth: ${formatError(error)}`);
    }
  }

  /**
   * Get the current session (requires auth)
   */
  async getSession(): Promise<{ did: string; handle: string; email?: string }> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.agent.api as any).xrpc.get('com.atproto.server.getSession', {});
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get session: ${formatError(error)}`);
    }
  }

  /**
   * List app passwords (requires auth)
   */
  async listAppPasswords(): Promise<unknown> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.agent.api as any).xrpc.get(
        'com.atproto.server.listAppPasswords',
        {}
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to list app passwords: ${formatError(error)}`);
    }
  }

  /**
   * Refresh the current session (requires auth + refreshJwt)
   */
  async refreshSession(): Promise<{ accessJwt: string; refreshJwt: string; handle: string; did: string }> {
    if (!this.isLoggedIn() || !this.session) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await fetch(`${this.serviceUrl}/xrpc/com.atproto.server.refreshSession`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.session.refreshJwt}`
        }
      });

      if (!response.ok) {
        let message = `Refresh session failed: ${response.status} ${response.statusText}`;
        try {
          const errorData = (await response.json()) as { message?: string; error?: string };
          if (errorData?.message) {
            message = errorData.message;
          } else if (errorData?.error) {
            message = errorData.error;
          }
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(message);
      }

      const data = (await response.json()) as { accessJwt: string; refreshJwt: string; handle: string; did: string };
      this.session = {
        accessJwt: data.accessJwt,
        refreshJwt: data.refreshJwt,
        did: data.did,
        handle: data.handle
      };
      return data;
    } catch (error) {
      throw new Error(`Failed to refresh session: ${formatError(error)}`);
    }
  }

  /**
   * Logout and clear session
   */
  logout(): void {
    this.agent = new BskyAgent({ service: this.serviceUrl });
    this.session = null;
    this.isAuthenticated = false;
  }
}

/**
 * Factory function to create a new Bluesky client instance
 */
export function createBlueskyClient(serviceUrl?: string): BlueskyClient {
  return new BlueskyClient(serviceUrl);
}
