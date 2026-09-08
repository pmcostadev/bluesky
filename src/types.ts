/**
 * Bluesky MCP Server - Type Definitions
 * Secure remote MCP for managing Bluesky with external credential injection
 */

export interface BlueskyCredentials {
  identifier: string;
  password: string;
}

// MCP server configuration loaded from environment variables
export interface MCPConfiguration {
  identifier: string;
  password: string;
}

export interface AuthenticatedSession {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
}

export interface PostRecord {
  text: string;
  createdAt: string;
  langs?: string[];
  reply?: {
    root: { uri: string; cid: string };
    parent: { uri: string; cid: string };
  };
  embed?: Record<string, unknown>;
  facets?: unknown[];
}

export interface ImageInput {
  source: string;
  alt: string;
  aspectRatio?: {
    width: number;
    height: number;
  };
}

export interface ProcessedImage {
  data: Uint8Array;
  mimeType: string;
  alt: string;
  aspectRatio?: {
    width: number;
    height: number;
  };
}

export interface TimelineOptions {
  cursor?: string;
  limit?: number;
}

export interface FeedOptions {
  feed: string;
  cursor?: string;
  limit?: number;
}

export interface AuthorFeedOptions {
  actor: string;
  filter?: 'posts_with_replies' | 'posts_no_replies' | 'posts_with_media' | 'posts_and_author_threads';
  cursor?: string;
  limit?: number;
}

export interface ThreadOptions {
  uri: string;
  depth?: number;
  parentHeight?: number;
}

export interface SearchActorsOptions {
  term: string;
  limit?: number;
}

export interface ProfileView {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  banner?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  indexedAt?: string;
  createdAt?: string;
}

export interface ActorSearchResult {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
}

export interface PostView {
  uri: string;
  cid: string;
  author: ProfileView;
  record: PostRecord;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  indexedAt: string;
  labels?: string[];
}

export interface ThreadViewPost {
  post: PostView;
  parent?: ThreadViewPost | NotFoundPost | BlockedPost | Record<string, unknown>;
  replies?: (ThreadViewPost | NotFoundPost | BlockedPost | Record<string, unknown>)[];
}

export interface NotFoundPost {
  uri: string;
  notFound: true;
}

export interface BlockedPost {
  uri: string;
  blocked: true;
  author?: { did: string; handle: string };
}

export interface FeedViewPost {
  post: PostView;
  reply?: {
    parent: PostView;
    root: PostView;
  };
  reason?: {
    $type: string;
    by: ProfileView;
    indexedAt: string;
  };
}

export interface CreatePostResult {
  uri: string;
  cid: string;
}

export interface SearchPostsOptions {
  q: string;
  cursor?: string;
  limit?: number;
  sort?: 'latest' | 'top';
  mentions?: string;
  author?: string;
  lang?: string;
  domain?: string;
  url?: string;
  tags?: string[];
}

export interface SearchPostsResult {
  posts: PostView[];
  cursor?: string;
}

// MCP Tool Input/Output Types
export interface ToolInput<T = unknown> {
  params: T;
  credentials?: BlueskyCredentials;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SearchPostsInput {
  query: string;
  limit?: number;
  cursor?: string;
  sort?: 'latest' | 'top';
  mentions?: string;
  author?: string;
  lang?: string;
}

export interface CreatePostInput {
  text: string;
  langs?: string[];
  reply?: {
    rootUri: string;
    rootCid: string;
    parentUri: string;
    parentCid: string;
  };
  images?: ImageInput[];
}

export interface GetTimelineInput {
  cursor?: string;
  limit?: number;
}

export interface GetAuthorFeedInput {
  actor: string;
  filter?: 'posts_with_replies' | 'posts_no_replies' | 'posts_with_media' | 'posts_and_author_threads';
  cursor?: string;
  limit?: number;
}

export interface GetThreadInput {
  uri: string;
  depth?: number;
  parentHeight?: number;
}

export interface GetProfileInput {
  actor: string;
}

export interface SearchActorsInput {
  term: string;
  limit?: number;
}

export interface GetFeedInput {
  feed: string;
  cursor?: string;
  limit?: number;
}

export interface SearchPostsForAIInput {
  query: string;
  limit?: number;
}

export interface DeletePostInput {
  uri?: string;
  rkey?: string;
}

export interface DraftInput {
  text: string;
  langs?: string[];
  images?: ImageInput[];
}

export interface UpdateDraftInput {
  id: string;
  text: string;
  langs?: string[];
  images?: ImageInput[];
}

export interface DeleteDraftInput {
  id: string;
}

export interface GetDraftsInput {
  cursor?: string;
  limit?: number;
}

export interface SearchAccountsInput {
  email?: string;
  cursor?: string;
  limit?: number;
}

export interface CreateBookmarkInput {
  uri: string;
  cid: string;
}

export interface DeleteBookmarkInput {
  uri: string;
}

export interface AddReactionInput {
  convoId: string;
  messageId: string;
  value: string;
}

export interface RemoveReactionInput {
  convoId: string;
  messageId: string;
  value: string;
}

export interface GetMessagesInput {
  convoId: string;
  cursor?: string;
  limit?: number;
}

export interface SendMessageInput {
  convoId: string;
  message: {
    text: string;
  };
}

export interface SendMessageBatchInput {
  items: Array<{
    convoId: string;
    message: {
      text: string;
    };
  }>;
}

export interface GetMessageContextInput {
  messageId: string;
}

export interface UpdateEmailInput {
  email: string;
  token?: string;
}

export interface AdminSendEmailInput {
  recipientDid: string;
  content: string;
  subject?: string;
  senderDid?: string;
  comment?: string;
}

export interface ConfirmEmailInput {
  email: string;
  token: string;
}

export interface CreateAccountInput {
  email: string;
  handle: string;
  password: string;
  inviteCode?: string;
  verificationCode?: string;
  verificationPhone?: string;
  plcOp?: Record<string, unknown>;
}

export interface CreateAppPasswordInput {
  name: string;
}

export interface CreateInviteCodeInput {
  forAccount?: string;
  useCount?: number;
}

export interface CreateInviteCodesInput {
  codeCount?: number;
  useCount?: number;
  forAccounts?: string[];
}

export interface CreateSessionInput {
  identifier: string;
  password: string;
  authFactorToken?: string;
}

export interface DeactivateAccountInput {
  deleteAfter?: string;
}

export interface DeleteAccountInput {
  password: string;
}

export interface GetAccountInviteCodesInput {
  includeUsed?: boolean;
  createAvailable?: boolean;
}

export interface GetServiceAuthInput {
  aud: string;
  lxm?: string;
  exp?: number;
}

export interface UploadBlobInput {
  source: string;
  mimeType?: string;
}

// Rate limiting types
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Cache types
export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// API Response types
export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  version: string;
  authenticated: boolean;
  serviceUrl: string;
}

export interface ConnectivityResponse {
  status: 'connected' | 'error';
  serviceUrl: string;
  authenticated: boolean;
  did?: string;
  handle?: string;
  error?: string;
}
