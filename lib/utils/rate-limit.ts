import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Per-IP (and global) request caps for the public demo.
 *
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are
 * set — the only reliable option on Vercel, whose serverless instances don't
 * share memory. Without those, it falls back to a best-effort in-memory limiter
 * (fine for local dev; NOT reliable across serverless instances/cold-starts).
 *
 * The global cap bounds worst-case model spend regardless of how requests are
 * distributed across IPs (CGNAT, IPv6 rotation). All limits are env-tunable.
 */
const PER_IP_MAX = Number(process.env.RATE_LIMIT_PER_IP_MAX) || 10;
const GLOBAL_MAX = Number(process.env.RATE_LIMIT_GLOBAL_MAX) || 200;
const WINDOW_MS = 60_000;
const WINDOW = "60 s" as const;

export type LimitResult = {
  success: boolean;
  remaining: number;
  /** Milliseconds until the caller may retry. */
  resetAfter: number;
};

// ── Upstash (preferred in prod) ─────────────────────────────────────────
let redisPerIp: Ratelimit | null = null;
let redisGlobal: Ratelimit | null = null;
let redisInitialized = false;

function initRedis() {
  if (redisInitialized) return;
  redisInitialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  try {
    const redis = new Redis({ url, token });
    // analytics:false keeps it to one Redis command per check (analytics adds a
    // second write returned as an un-awaited promise — wasteful on the free tier).
    redisPerIp = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(PER_IP_MAX, WINDOW),
      analytics: false,
      prefix: "last-ehr:ip",
    });
    redisGlobal = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(GLOBAL_MAX, WINDOW),
      analytics: false,
      prefix: "last-ehr:global",
    });
  } catch (err) {
    console.error(
      "[rate-limit] Redis init failed; using in-memory fallback:",
      err,
    );
    redisPerIp = null;
    redisGlobal = null;
  }
}

async function redisCheck(limiter: Ratelimit, id: string): Promise<LimitResult> {
  const r = await limiter.limit(id);
  // Upstash returns `reset` as an absolute epoch-ms timestamp (there is no
  // `resetAfter`), so convert to a relative value for the caller.
  return {
    success: r.success,
    remaining: r.remaining,
    resetAfter: Math.max(0, r.reset - Date.now()),
  };
}

// ── In-memory fallback ──────────────────────────────────────────────────
const memory = new Map<string, number[]>();
let warnedInMemory = false;

function memoryCheck(key: string, max: number): LimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const hits = (memory.get(key) ?? []).filter((ts) => ts > windowStart);

  const success = hits.length < max;
  if (success) hits.push(now);
  memory.set(key, hits);

  const resetAfter = hits.length ? Math.max(0, hits[0] + WINDOW_MS - now) : 0;
  return { success, remaining: Math.max(0, max - hits.length), resetAfter };
}

/**
 * Check the rate limit for a client identifier (usually its IP). Consumes one
 * token from the per-IP bucket and, if that passes, one from the global bucket.
 */
export async function checkRateLimit(identifier: string): Promise<LimitResult> {
  initRedis();

  if (redisPerIp && redisGlobal) {
    try {
      const perIp = await redisCheck(redisPerIp, identifier);
      if (!perIp.success) return perIp;
      const global = await redisCheck(redisGlobal, "global");
      return global.success ? perIp : global;
    } catch (err) {
      console.error(
        "[rate-limit] Redis check failed; using in-memory fallback:",
        err,
      );
    }
  }

  if (!warnedInMemory) {
    console.warn(
      "[rate-limit] Using best-effort in-memory limiter (not shared across " +
        "serverless instances). Set UPSTASH_REDIS_REST_URL + " +
        "UPSTASH_REDIS_REST_TOKEN for reliable limits.",
    );
    warnedInMemory = true;
  }

  const perIp = memoryCheck(`ip:${identifier}`, PER_IP_MAX);
  if (!perIp.success) return perIp;
  const global = memoryCheck("global", GLOBAL_MAX);
  return global.success ? perIp : global;
}

/**
 * Client IP from proxy headers. On Vercel `x-forwarded-for` is set by the
 * platform; on a self-hosted deploy this header is only trustworthy behind a
 * proxy that overwrites it (otherwise a client can spoof it).
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}
