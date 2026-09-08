import { BlueskyClient } from './bluesky-client';
import {
  sanitizeString,
  sanitizeCursor,
  sanitizeLimit,
  validateAtUri,
  validatePostText,
  validateRkey,
  extractRkeyFromUri,
  validateImages,
  fetchImage,
  DEFAULT_LIMIT
} from './sanitize';
import { formatError } from './utils';
import type {
  CreatePostInput,
  GetTimelineInput,
  GetAuthorFeedInput,
  GetThreadInput,
  GetProfileInput,
  SearchActorsInput,
  SearchPostsInput,
  GetFeedInput,
  DeletePostInput,
  DraftInput,
  UpdateDraftInput,
  DeleteDraftInput,
  GetDraftsInput,
  SearchAccountsInput,
  CreateBookmarkInput,
  DeleteBookmarkInput,
  AddReactionInput,
  RemoveReactionInput,
  GetMessagesInput,
  SendMessageInput,
  SendMessageBatchInput,
  GetMessageContextInput,
  UpdateEmailInput,
  AdminSendEmailInput,
  ConfirmEmailInput,
  CreateAccountInput,
  CreateAppPasswordInput,
  CreateInviteCodeInput,
  CreateInviteCodesInput,
  CreateSessionInput,
  DeactivateAccountInput,
  DeleteAccountInput,
  GetAccountInviteCodesInput,
  GetServiceAuthInput,
  ProcessedImage,
  UploadBlobInput,
  ToolResult
} from './types';

/**
 * If authenticated, route through the user's PDS (works for all endpoints).
 * Otherwise fall back to the public AppView (read-only, no auth).
 */
function getPublicClient(client: BlueskyClient): BlueskyClient {
  return client.isLoggedIn() ? client : new BlueskyClient('https://public.api.bsky.app');
}

// ── Posts ────────────────────────────────────────────────────────────────────

export async function handleCreatePost(client: BlueskyClient, params: CreatePostInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required.' };
    const validation = validatePostText(params.text);
    if (!validation.valid || !validation.text) return { success: false, error: validation.error };
    let images: ProcessedImage[] | undefined;
    if (params.images) {
      const imgValidation = await validateImages(params.images);
      if (!imgValidation.valid) return { success: false, error: imgValidation.error };
      images = imgValidation.images;
    }
    const result = await client.createPost(validation.text, {
      langs: params.langs?.filter((l): l is string => typeof l === 'string'),
      reply: params.reply,
      images
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetPosts(client: BlueskyClient, params: { uris: string[] }): Promise<ToolResult> {
  try {
    if (!params.uris || !Array.isArray(params.uris) || params.uris.length === 0)
      return { success: false, error: 'URIs array is required' };
    if (params.uris.length > 25) return { success: false, error: 'Maximum 25 URIs per request' };
    const validUris: string[] = [];
    for (const uri of params.uris) {
      const v = validateAtUri(uri);
      if (v.valid && v.uri) validUris.push(v.uri);
    }
    if (validUris.length === 0) return { success: false, error: 'No valid AT Protocol URIs provided (must start with at://)' };
    const result = await getPublicClient(client).getPosts(validUris);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetLikes(client: BlueskyClient, params: { uri: string; cursor?: string; limit?: number }): Promise<ToolResult> {
  try {
    const v = validateAtUri(params.uri);
    if (!v.valid || !v.uri) return { success: false, error: v.error };
    const result = await getPublicClient(client).getLikes(v.uri, sanitizeCursor(params.cursor), sanitizeLimit(params.limit, 50));
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetRepostedBy(client: BlueskyClient, params: { uri: string; cursor?: string; limit?: number }): Promise<ToolResult> {
  try {
    const v = validateAtUri(params.uri);
    if (!v.valid || !v.uri) return { success: false, error: v.error };
    const result = await getPublicClient(client).getRepostedBy(v.uri, sanitizeCursor(params.cursor), sanitizeLimit(params.limit, 50));
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleLikePost(client: BlueskyClient, params: { uri: string; cid: string }): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.like(params.uri, params.cid);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleRepostPost(client: BlueskyClient, params: { uri: string; cid: string }): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.repost(params.uri, params.cid);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleUnlikePost(client: BlueskyClient, params: { uri: string }): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.uri) return { success: false, error: 'URI is required' };
    const v = validateAtUri(params.uri);
    if (!v.valid || !v.uri) return { success: false, error: v.error };
    await client.deleteLike(v.uri);
    return { success: true, data: { unliked: true, uri: params.uri } };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleUnrepostPost(client: BlueskyClient, params: { uri: string }): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.uri) return { success: false, error: 'URI is required' };
    const v = validateAtUri(params.uri);
    if (!v.valid || !v.uri) return { success: false, error: v.error };
    await client.deleteRepost(v.uri);
    return { success: true, data: { unreposted: true, uri: params.uri } };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Feeds ────────────────────────────────────────────────────────────────────

export async function handleGetTimeline(client: BlueskyClient, params: GetTimelineInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required.' };
    const result = await client.getTimeline({ cursor: sanitizeCursor(params.cursor), limit: sanitizeLimit(params.limit, DEFAULT_LIMIT) });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetFeed(client: BlueskyClient, params: GetFeedInput): Promise<ToolResult> {
  try {
    if (!params.feed?.startsWith('at://')) return { success: false, error: 'Invalid feed URI. Must start with at://' };
    const result = await getPublicClient(client).getFeed({ feed: params.feed, cursor: sanitizeCursor(params.cursor), limit: sanitizeLimit(params.limit, DEFAULT_LIMIT) });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetAuthorFeed(client: BlueskyClient, params: GetAuthorFeedInput): Promise<ToolResult> {
  try {
    if (!params.actor) return { success: false, error: 'Actor parameter is required' };
    const result = await getPublicClient(client).getAuthorFeed({ actor: sanitizeString(params.actor), filter: params.filter, cursor: sanitizeCursor(params.cursor), limit: sanitizeLimit(params.limit, DEFAULT_LIMIT) });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetThread(client: BlueskyClient, params: GetThreadInput): Promise<ToolResult> {
  try {
    const v = validateAtUri(params.uri);
    if (!v.valid || !v.uri) return { success: false, error: v.error };
    const result = await getPublicClient(client).getPostThread({ uri: v.uri, depth: Math.min(Math.max(0, params.depth ?? 6), 1000), parentHeight: Math.min(Math.max(0, params.parentHeight ?? 80), 1000) });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Profiles ──────────────────────────────────────────────────────────────────

export async function handleGetProfile(client: BlueskyClient, params: GetProfileInput): Promise<ToolResult> {
  try {
    if (!params.actor) return { success: false, error: 'Actor parameter is required' };
    const result = await getPublicClient(client).getProfile(sanitizeString(params.actor));
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetProfiles(client: BlueskyClient, params: { actors: string[] }): Promise<ToolResult> {
  try {
    if (!params.actors || !Array.isArray(params.actors) || params.actors.length === 0)
      return { success: false, error: 'Actors array is required' };
    if (params.actors.length > 25) return { success: false, error: 'Maximum 25 actors per request' };
    const sanitizedActors = params.actors.filter((a): a is string => typeof a === 'string').map(a => sanitizeString(a)).filter(a => a.length > 0);
    if (sanitizedActors.length === 0) return { success: false, error: 'No valid actors provided' };
    const result = await getPublicClient(client).getProfiles(sanitizedActors);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetSuggestions(client: BlueskyClient, params: { limit?: number }): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.getSuggestions(sanitizeLimit(params.limit, 10));
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function handleSearchActors(client: BlueskyClient, params: SearchActorsInput): Promise<ToolResult> {
  try {
    if (!params.term) return { success: false, error: 'Search term is required' };
    const result = await getPublicClient(client).searchActors({ term: sanitizeString(params.term), limit: sanitizeLimit(params.limit, 10) });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleSearchActorsTypeahead(client: BlueskyClient, params: SearchActorsInput): Promise<ToolResult> {
  try {
    if (!params.term) return { success: false, error: 'Search term is required' };
    const result = await getPublicClient(client).searchActorsTypeahead({ term: sanitizeString(params.term), limit: sanitizeLimit(params.limit, 10) });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleSearchPosts(client: BlueskyClient, params: SearchPostsInput): Promise<ToolResult> {
  try {
    if (!params.query) return { success: false, error: 'Search query is required' };
    const result = await getPublicClient(client).searchPosts({ q: sanitizeString(params.query), cursor: sanitizeCursor(params.cursor), limit: sanitizeLimit(params.limit, DEFAULT_LIMIT), sort: params.sort, mentions: params.mentions, author: params.author, lang: params.lang });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Account / Preferences ─────────────────────────────────────────────────────

export async function handleGetPreferences(client: BlueskyClient): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.getPreferences();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────

export async function handleCreateBookmark(client: BlueskyClient, params: CreateBookmarkInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.uri) return { success: false, error: 'Post URI is required' };
    if (!params.cid) return { success: false, error: 'Post CID is required' };
    const v = validateAtUri(params.uri);
    if (!v.valid || !v.uri) return { success: false, error: v.error };
    const result = await client.createBookmark(v.uri, params.cid);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleDeleteBookmark(client: BlueskyClient, params: DeleteBookmarkInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const v = validateAtUri(params.uri);
    if (!v.valid || !v.uri) return { success: false, error: v.error };
    await client.deleteBookmark(v.uri);
    return { success: true, data: { deleted: true, uri: params.uri } };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetBookmarks(client: BlueskyClient, params: { cursor?: string; limit?: number }): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.getBookmarks(sanitizeCursor(params.cursor), sanitizeLimit(params.limit, 50));
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Age Assurance ─────────────────────────────────────────────────────────────

export async function handleBeginAgeAssurance(client: BlueskyClient): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.beginAgeAssurance();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetAgeAssuranceConfig(client: BlueskyClient): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.getAgeAssuranceConfig();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetAgeAssuranceState(client: BlueskyClient): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.getAgeAssuranceState();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Posts (Delete) ────────────────────────────────────────────────────────────

export async function handleDeletePost(client: BlueskyClient, params: DeletePostInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    let rkey: string | undefined;
    if (params.rkey) {
      const v = validateRkey(params.rkey);
      if (!v.valid || !v.rkey) return { success: false, error: v.error };
      rkey = v.rkey;
    } else if (params.uri) {
      const v = validateAtUri(params.uri);
      if (!v.valid || !v.uri) return { success: false, error: v.error };
      const extracted = extractRkeyFromUri(v.uri);
      if (!extracted) return { success: false, error: 'Could not extract rkey from URI' };
      rkey = extracted;
    } else {
      return { success: false, error: 'Either uri or rkey is required' };
    }
    await client.deletePost(rkey);
    return { success: true, data: { deleted: true, rkey } };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Drafts ────────────────────────────────────────────────────────────────────

export async function handleCreateDraft(client: BlueskyClient, params: DraftInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const validation = validatePostText(params.text);
    if (!validation.valid || !validation.text) return { success: false, error: validation.error };
    let images: ProcessedImage[] | undefined;
    if (params.images) {
      const imgValidation = await validateImages(params.images);
      if (!imgValidation.valid) return { success: false, error: imgValidation.error };
      images = imgValidation.images;
    }
    const result = await client.createDraft(
      validation.text,
      params.langs?.filter((l): l is string => typeof l === 'string'),
      images
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleUpdateDraft(client: BlueskyClient, params: UpdateDraftInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.id) return { success: false, error: 'Draft ID is required' };
    const validation = validatePostText(params.text);
    if (!validation.valid || !validation.text) return { success: false, error: validation.error };
    let images: ProcessedImage[] | undefined;
    if (params.images) {
      const imgValidation = await validateImages(params.images);
      if (!imgValidation.valid) return { success: false, error: imgValidation.error };
      images = imgValidation.images;
    }
    await client.updateDraft(
      sanitizeString(params.id),
      validation.text,
      params.langs?.filter((l): l is string => typeof l === 'string'),
      images
    );
    return { success: true, data: { updated: true, id: params.id } };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleDeleteDraft(client: BlueskyClient, params: DeleteDraftInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.id) return { success: false, error: 'Draft ID is required' };
    await client.deleteDraft(sanitizeString(params.id));
    return { success: true, data: { deleted: true, id: params.id } };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetDrafts(client: BlueskyClient, params: GetDraftsInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.getDrafts(sanitizeCursor(params.cursor), sanitizeLimit(params.limit, 50));
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Blob Upload ──────────────────────────────────────────────────────────────

export async function handleUploadBlob(client: BlueskyClient, params: UploadBlobInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.source) return { success: false, error: 'source is required' };

    const source = sanitizeString(params.source, 50000);
    if (!source) return { success: false, error: 'source cannot be empty' };

    const { data, mimeType } = await fetchImage(source);

    // Allow overriding the inferred MIME type
    const finalMimeType = params.mimeType ? sanitizeString(params.mimeType, 100) : mimeType;

    const blob = await client.uploadBlob(data, finalMimeType);
    return { success: true, data: { blob, mimeType: finalMimeType, size: data.length } };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Admin Search ──────────────────────────────────────────────────────────────

export async function handleSearchAccounts(client: BlueskyClient, params: SearchAccountsInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.searchAccounts({
      email: params.email ? sanitizeString(params.email) : undefined,
      cursor: sanitizeCursor(params.cursor),
      limit: sanitizeLimit(params.limit, DEFAULT_LIMIT)
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export async function handleAddReaction(client: BlueskyClient, params: AddReactionInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.convoId) return { success: false, error: 'convoId is required' };
    if (!params.messageId) return { success: false, error: 'messageId is required' };
    if (!params.value) return { success: false, error: 'value is required' };
    const result = await client.addReaction(
      sanitizeString(params.convoId),
      sanitizeString(params.messageId),
      sanitizeString(params.value)
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleRemoveReaction(client: BlueskyClient, params: RemoveReactionInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.convoId) return { success: false, error: 'convoId is required' };
    if (!params.messageId) return { success: false, error: 'messageId is required' };
    if (!params.value) return { success: false, error: 'value is required' };
    const result = await client.removeReaction(
      sanitizeString(params.convoId),
      sanitizeString(params.messageId),
      sanitizeString(params.value)
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetMessages(client: BlueskyClient, params: GetMessagesInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.convoId) return { success: false, error: 'convoId is required' };
    const result = await client.getMessages(
      sanitizeString(params.convoId),
      sanitizeCursor(params.cursor),
      sanitizeLimit(params.limit, 50)
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleSendMessage(client: BlueskyClient, params: SendMessageInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.convoId) return { success: false, error: 'convoId is required' };
    if (!params.message?.text) return { success: false, error: 'message.text is required' };
    const result = await client.sendMessage(
      sanitizeString(params.convoId),
      { text: sanitizeString(params.message.text, 1000) }
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleSendMessageBatch(client: BlueskyClient, params: SendMessageBatchInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.items || !Array.isArray(params.items) || params.items.length === 0) {
      return { success: false, error: 'items array is required and must not be empty' };
    }
    if (params.items.length > 25) return { success: false, error: 'Maximum 25 items per batch' };
    const sanitizedItems = [];
    for (const item of params.items) {
      if (!item.convoId) return { success: false, error: 'Each item must have a convoId' };
      if (!item.message?.text) return { success: false, error: 'Each item must have message.text' };
      sanitizedItems.push({
        convoId: sanitizeString(item.convoId),
        message: { text: sanitizeString(item.message.text, 1000) }
      });
    }
    const result = await client.sendMessageBatch(sanitizedItems);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetMessageContext(client: BlueskyClient, params: GetMessageContextInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.messageId) return { success: false, error: 'messageId is required' };
    const result = await client.getMessageContext(sanitizeString(params.messageId));
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Account ───────────────────────────────────────────────────────────────────

export async function handleUpdateEmail(client: BlueskyClient, params: UpdateEmailInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.email) return { success: false, error: 'email is required' };
    await client.updateEmail(
      sanitizeString(params.email),
      params.token ? sanitizeString(params.token) : undefined
    );
    return { success: true, data: { updated: true } };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Server / Account Management ───────────────────────────────────────────────

export async function handleAdminSendEmail(client: BlueskyClient, params: AdminSendEmailInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.recipientDid) return { success: false, error: 'recipientDid is required' };
    if (!params.content) return { success: false, error: 'content is required' };
    const result = await client.adminSendEmail(
      sanitizeString(params.recipientDid),
      sanitizeString(params.content),
      params.subject ? sanitizeString(params.subject) : undefined,
      params.senderDid ? sanitizeString(params.senderDid) : undefined,
      params.comment ? sanitizeString(params.comment) : undefined
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleConfirmEmail(client: BlueskyClient, params: ConfirmEmailInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.email) return { success: false, error: 'email is required' };
    if (!params.token) return { success: false, error: 'token is required' };
    await client.confirmEmail(sanitizeString(params.email), sanitizeString(params.token));
    return { success: true, data: { confirmed: true } };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleCreateAccount(client: BlueskyClient, params: CreateAccountInput): Promise<ToolResult> {
  try {
    if (!params.email) return { success: false, error: 'email is required' };
    if (!params.handle) return { success: false, error: 'handle is required' };
    if (!params.password) return { success: false, error: 'password is required' };
    const result = await client.createAccount(
      sanitizeString(params.email),
      sanitizeString(params.handle),
      params.password,
      params.inviteCode ? sanitizeString(params.inviteCode) : undefined,
      params.verificationCode ? sanitizeString(params.verificationCode) : undefined,
      params.verificationPhone ? sanitizeString(params.verificationPhone) : undefined,
      params.plcOp
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleCreateAppPassword(client: BlueskyClient, params: CreateAppPasswordInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.name) return { success: false, error: 'name is required' };
    const result = await client.createAppPassword(sanitizeString(params.name));
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleCreateInviteCode(client: BlueskyClient, params: CreateInviteCodeInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.createInviteCode(
      params.forAccount ? sanitizeString(params.forAccount) : undefined,
      params.useCount
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleCreateInviteCodes(client: BlueskyClient, params: CreateInviteCodesInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.createInviteCodes(
      params.codeCount,
      params.useCount,
      params.forAccounts?.filter((a): a is string => typeof a === 'string').map(a => sanitizeString(a))
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleCreateSession(client: BlueskyClient, params: CreateSessionInput): Promise<ToolResult> {
  try {
    if (!params.identifier) return { success: false, error: 'identifier is required' };
    if (!params.password) return { success: false, error: 'password is required' };
    const result = await client.createSession(
      sanitizeString(params.identifier),
      params.password,
      params.authFactorToken ? sanitizeString(params.authFactorToken) : undefined
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleDeactivateAccount(client: BlueskyClient, params: DeactivateAccountInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    await client.deactivateAccount(params.deleteAfter ? sanitizeString(params.deleteAfter) : undefined);
    return { success: true, data: { deactivated: true } };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleDeleteAccount(client: BlueskyClient, params: DeleteAccountInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.password) return { success: false, error: 'password is required' };
    await client.deleteAccount(params.password);
    return { success: true, data: { deleted: true } };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleDeleteSession(client: BlueskyClient): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    await client.deleteSession();
    return { success: true, data: { deleted: true } };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleDescribeServer(client: BlueskyClient): Promise<ToolResult> {
  try {
    const result = await client.describeServer();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetAccountInviteCodes(client: BlueskyClient, params: GetAccountInviteCodesInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.getAccountInviteCodes(params.includeUsed, params.createAvailable);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetServiceAuth(client: BlueskyClient, params: GetServiceAuthInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    if (!params.aud) return { success: false, error: 'aud is required' };
    const result = await client.getServiceAuth(
      sanitizeString(params.aud),
      params.lxm ? sanitizeString(params.lxm) : undefined,
      params.exp
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetSession(client: BlueskyClient): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.getSession();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleListAppPasswords(client: BlueskyClient): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.listAppPasswords();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleRefreshSession(client: BlueskyClient): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.refreshSession();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

export async function handleTestConnectivity(client: BlueskyClient): Promise<ToolResult> {
  try {
    const result = await client.testConnectivity();
    const sessionInfo = client.getSessionInfo();
    return {
      success: true,
      data: {
        connected: result.connected,
        authenticated: sessionInfo.authenticated,
        did: sessionInfo.did,
        handle: sessionInfo.handle,
        serviceUrl: 'https://bsky.social',
        error: result.error
      }
    };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const toolHandlers: Record<string, (...args: any[]) => Promise<ToolResult>> = {
  // Posts
  create_post: handleCreatePost,
  get_posts: handleGetPosts,
  get_likes: handleGetLikes,
  get_reposted_by: handleGetRepostedBy,
  like_post: handleLikePost,
  repost_post: handleRepostPost,
  unlike_post: handleUnlikePost,
  unrepost_post: handleUnrepostPost,
  delete_post: handleDeletePost,
  // Feeds
  get_timeline: handleGetTimeline,
  get_feed: handleGetFeed,
  get_author_feed: handleGetAuthorFeed,
  get_thread: handleGetThread,
  // Profiles
  get_profile: handleGetProfile,
  get_profiles: handleGetProfiles,
  get_suggestions: handleGetSuggestions,
  // Search
  search_actors: handleSearchActors,
  search_actors_typeahead: handleSearchActorsTypeahead,
  search_posts: handleSearchPosts,
  search_accounts: handleSearchAccounts,
  // Account
  get_preferences: handleGetPreferences,
  update_email: handleUpdateEmail,
  // Server / Account Management
  admin_send_email: handleAdminSendEmail,
  confirm_email: handleConfirmEmail,
  create_account: handleCreateAccount,
  create_app_password: handleCreateAppPassword,
  create_invite_code: handleCreateInviteCode,
  create_invite_codes: handleCreateInviteCodes,
  create_session: handleCreateSession,
  deactivate_account: handleDeactivateAccount,
  delete_account: handleDeleteAccount,
  delete_session: handleDeleteSession,
  describe_server: handleDescribeServer,
  get_account_invite_codes: handleGetAccountInviteCodes,
  get_service_auth: handleGetServiceAuth,
  get_session: handleGetSession,
  list_app_passwords: handleListAppPasswords,
  refresh_session: handleRefreshSession,
  // Chat
  add_reaction: handleAddReaction,
  remove_reaction: handleRemoveReaction,
  get_messages: handleGetMessages,
  send_message: handleSendMessage,
  send_message_batch: handleSendMessageBatch,
  get_message_context: handleGetMessageContext,
  // Bookmarks
  create_bookmark: handleCreateBookmark,
  delete_bookmark: handleDeleteBookmark,
  get_bookmarks: handleGetBookmarks,
  // Drafts
  create_draft: handleCreateDraft,
  update_draft: handleUpdateDraft,
  delete_draft: handleDeleteDraft,
  get_drafts: handleGetDrafts,
  // Age Assurance
  begin_age_assurance: handleBeginAgeAssurance,
  get_age_assurance_config: handleGetAgeAssuranceConfig,
  get_age_assurance_state: handleGetAgeAssuranceState,
  // Blob Upload
  upload_blob: handleUploadBlob,
  // Utility
  test_connectivity: handleTestConnectivity,
};

export function isValidTool(toolName: string): boolean {
  return toolName in toolHandlers;
}
