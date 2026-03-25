/**
 * Simple in-memory rate limiter for Vercel serverless functions.
 * Limits requests per IP address within a time window.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory store — resets when the serverless function cold starts
const store = new Map<string, RateLimitEntry>()

interface RateLimitOptions {
  windowMs: number  // time window in milliseconds
  max: number       // max requests per window
}

export function rateLimit(ip: string, options: RateLimitOptions): {
  success: boolean
  remaining: number
  resetAt: number
} {
  const now = Date.now()
  const entry = store.get(ip)

  // Clean up expired entries every 100 requests
  if (store.size > 100) {
    for (const [key, val] of store.entries()) {
      if (val.resetAt < now) store.delete(key)
    }
  }

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(ip, { count: 1, resetAt: now + options.windowMs })
    return { success: true, remaining: options.max - 1, resetAt: now + options.windowMs }
  }

  if (entry.count >= options.max) {
    return { success: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { success: true, remaining: options.max - entry.count, resetAt: entry.resetAt }
}

export function getIp(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]
    return ip.trim()
  }
  return req.socket?.remoteAddress ?? 'unknown'
}