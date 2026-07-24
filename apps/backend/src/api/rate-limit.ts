import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// Per-IP fixed-window rate limiter for the AI routes, which call paid providers
// (OpenAI, Voyage) on every request. Without it, `/search/chat` — unauthenticated
// and outside Medusa's publishable-key check — can be looped to drain the Voyage
// free tier (3 RPM), run up OpenAI cost, or DoS the demo.
//
// In-memory and single-instance by design (MVP scale). Counters are NOT shared
// across instances, so horizontal scaling would need a shared store (e.g. Redis).
// The window is fixed, not sliding, so up to 2×max is possible across a boundary
// — fine for abuse control, not a precise quota.

export interface RateLimitOptions {
  windowMs?: number
  max?: number
  // Injectable clock so tests can advance time without real delays.
  now?: () => number
}

interface Bucket {
  count: number
  resetAt: number
}

const DEFAULT_WINDOW_MS = 60_000
const DEFAULT_MAX = 20

// Behind a proxy (Vercel) the socket peer is the proxy, so the real client is
// the left-most X-Forwarded-For hop. Falls back to the socket address for
// direct/local connections. X-Forwarded-For is only client-spoofable when NOT
// behind a trusted proxy; in this deployment Vercel sets it.
function clientKey(req: MedusaRequest): string {
  const xff = req.headers["x-forwarded-for"]
  const raw = Array.isArray(xff) ? xff[0] : xff
  if (raw) return raw.split(",")[0].trim()
  return req.ip ?? req.socket?.remoteAddress ?? "unknown"
}

export function createRateLimit(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS
  const max = options.max ?? DEFAULT_MAX
  const now = options.now ?? Date.now

  const buckets = new Map<string, Bucket>()
  // Sweeping happens at most once per window (not per request), so a flood of
  // distinct IPs can't turn cleanup itself into an O(n)-per-request DoS.
  let nextSweep = 0

  return function rateLimit(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
    const ts = now()

    if (ts >= nextSweep) {
      for (const [k, b] of buckets) {
        if (ts >= b.resetAt) buckets.delete(k)
      }
      nextSweep = ts + windowMs
    }

    const key = clientKey(req)
    const bucket = buckets.get(key)

    if (!bucket || ts >= bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: ts + windowMs })
      return next()
    }

    bucket.count += 1
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - ts) / 1000)))
      res.status(429).json({
        message: "Too many requests. Please slow down and try again in a moment.",
      })
      return
    }

    return next()
  }
}

// Shared instance wired into the AI routes (see middlewares.ts). One budget per
// IP across all AI endpoints — chat, semantic, image, and visual search draw
// from the same allowance.
export const aiRateLimit = createRateLimit()
