/**
 * Utility Functions for Bluesky MCP Server
 */

import { randomUUID } from 'crypto';

/**
 * Generate a unique request ID for tracking
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Get current ISO timestamp
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Parse languages from string or array
 */
export function parseLanguages(langs: unknown): string[] | undefined {
  if (!langs) return undefined;

  if (Array.isArray(langs)) {
    return langs
      .filter((l): l is string => typeof l === 'string' && l.length > 0)
      .slice(0, 5);
  }

  if (typeof langs === 'string') {
    return langs.split(',').map(l => l.trim()).filter(l => l.length > 0).slice(0, 5);
  }

  return undefined;
}

/**
 * Parse a comma-separated string into an array
 */
export function parseCommaSeparated(input: unknown): string[] | undefined {
  if (!input) return undefined;

  if (Array.isArray(input)) {
    return input.map(String).filter(s => s.length > 0);
  }

  if (typeof input === 'string') {
    return input.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }

  return undefined;
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Format error message for API response
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    // Don't expose internal error details
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      return 'Unable to connect to Bluesky service';
    }
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      return 'Authentication failed. Please check your credentials.';
    }
    if (error.message.includes('429') || error.message.includes('rate limit')) {
      return 'Rate limit exceeded. Please try again later.';
    }

    // Return user-friendly message without exposing internals
    return error.message;
  }

  return 'An unexpected error occurred';
}

/**
 * Format a Bluesky post for display
 */
export function formatPost(post: {
  author: { handle: string; displayName?: string };
  record: { text: string; createdAt: string };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
}): string {
  const author = post.author.displayName || post.author.handle;
  const text = post.record.text;
  const stats = [];

  if (post.likeCount) stats.push(`${post.likeCount} likes`);
  if (post.repostCount) stats.push(`${post.repostCount} reposts`);
  if (post.replyCount) stats.push(`${post.replyCount} replies`);

  return `@${author}: ${text}${stats.length ? ` (${stats.join(', ')})` : ''}`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Check if a value is a valid non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Create a sanitized error response object
 */
export function createErrorResponse(message: string, code = 'ERROR'): Record<string, unknown> {
  return {
    success: false,
    error: {
      code,
      message
    },
    timestamp: getCurrentTimestamp()
  };
}

/**
 * Create a success response object
 */
export function createSuccessResponse<T>(data: T): Record<string, unknown> {
  return {
    success: true,
    data,
    timestamp: getCurrentTimestamp()
  };
}