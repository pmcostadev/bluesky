/**
 * Security Middleware - Rate Limiting and Security Headers
 * Stateless rate limiting suitable for serverless deployment
 */

import type { Request, Response, NextFunction } from 'express';
import type { RateLimitConfig, RateLimitEntry } from './types';
import { SECURITY_HEADERS } from './sanitize';

// In-memory rate limit store (per-instance)
// For Vercel serverless, each invocation is independent
// For production, consider using a distributed cache like Redis
const rateLimitStore = new Map<string, RateLimitEntry>();

// Default configuration
const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100
};

// Cleanup old entries periodically
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const ENTRY_TTL = 15 * 60 * 1000; // 15 minutes

let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Get rate limit configuration from environment
 */
function getRateLimitConfig(): RateLimitConfig {
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '', 10);
  const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '', 10);

  return {
    windowMs: isNaN(windowMs) ? DEFAULT_RATE_LIMIT_CONFIG.windowMs : windowMs,
    maxRequests: isNaN(maxRequests) ? DEFAULT_RATE_LIMIT_CONFIG.maxRequests : maxRequests
  };
}

/**
 * Extract client identifier from request
 * Uses X-Forwarded-For header for proxies, or fallback to IP
 */
function getClientIdentifier(req: Request): string {
  // Check for forwarded headers (for proxy/load balancer setups)
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];

  let clientIp: string;

  if (typeof forwarded === 'string') {
    clientIp = forwarded.split(',')[0].trim();
  } else if (typeof realIp === 'string') {
    clientIp = realIp;
  } else {
    clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  }

  // Also include user agent for better identification
  const userAgent = req.headers['user-agent'] || 'unknown';

  return `${clientIp}:${hashString(userAgent)}`;
}

/**
 * Simple hash function for strings
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Check and update rate limit for a client
 */
function checkRateLimit(clientId: string): { allowed: boolean; remaining: number; resetTime: number } {
  const config = getRateLimitConfig();
  const now = Date.now();

  let entry = rateLimitStore.get(clientId);

  // If no entry or entry has expired, create new one
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 0,
      resetTime: now + config.windowMs
    };
    rateLimitStore.set(clientId, entry);
  }

  entry.count++;

  const remaining = Math.max(0, config.maxRequests - entry.count);
  const allowed = entry.count <= config.maxRequests;

  return {
    allowed,
    remaining,
    resetTime: entry.resetTime
  };
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientId = getClientIdentifier(req);
  const { allowed, remaining, resetTime } = checkRateLimit(clientId);

  // Set rate limit headers
  const config = getRateLimitConfig();
  res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', remaining.toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());

  if (!allowed) {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
      }
    });
    return;
  }

  next();
}

/**
 * Stricter rate limit for write operations
 */
export function writeRateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientId = getClientIdentifier(req);
  const config = getRateLimitConfig();

  // Stricter limit for write operations (1/4 of normal limit)
  const writeLimitConfig: RateLimitConfig = {
    windowMs: config.windowMs,
    maxRequests: Math.max(5, Math.floor(config.maxRequests / 4))
  };

  let entry = rateLimitStore.get(`write:${clientId}`);

  if (!entry || Date.now() > entry.resetTime) {
    entry = {
      count: 0,
      resetTime: Date.now() + writeLimitConfig.windowMs
    };
    rateLimitStore.set(`write:${clientId}`, entry);
  }

  entry.count++;

  const remaining = Math.max(0, writeLimitConfig.maxRequests - entry.count);
  const allowed = entry.count <= writeLimitConfig.maxRequests;

  res.setHeader('X-RateLimit-Limit', writeLimitConfig.maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', remaining.toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());

  if (!allowed) {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many write requests. Please slow down.',
        retryAfter: Math.ceil((entry.resetTime - Date.now()) / 1000)
      }
    });
    return;
  }

  next();
}

/**
 * Security headers middleware
 */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // Apply security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }

  // Remove server identification
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  next();
}

/**
 * Validate credentials header presence (but not value)
 */
export function validateCredentialsHeader(req: Request, res: Response, next: NextFunction): void {
  // For authenticated endpoints, validate that credentials headers are present
  if (req.method !== 'GET') {
    const identifier = req.headers['x-bluesky-identifier'];
    const password = req.headers['x-bluesky-password'];

    // We only check presence, not validity - that happens in the handler
    if (!identifier || !password) {
      res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_CREDENTIALS',
          message: 'Bluesky credentials are required. Provide X-BLUESKY-IDENTIFIER and X-BLUESKY-PASSWORD headers.'
        }
      });
      return;
    }
  }

  next();
}

/**
 * Input validation middleware for POST requests
 */
export function validatePostInput(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'POST') {
    const contentType = req.headers['content-type'];

    if (!contentType?.includes('application/json')) {
      res.status(415).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Content-Type must be application/json'
        }
      });
      return;
    }
  }

  next();
}

/**
 * Start periodic cleanup of old rate limit entries
 */
export function startRateLimitCleanup(): void {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();

    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime + ENTRY_TTL) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}

/**
 * Stop periodic cleanup
 */
export function stopRateLimitCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Clear all rate limit entries (for testing)
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

/**
 * CORS configuration for cross-origin requests
 */
export function corsOptions() {
  return {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-BLUESKY-IDENTIFIER', 'X-BLUESKY-PASSWORD'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    credentials: false,
    maxAge: 86400
  };
}