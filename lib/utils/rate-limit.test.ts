import { describe, it, expect } from "vitest";

// No UPSTASH_* env in the test environment, so this exercises the in-memory
// fallback path.
import { checkRateLimit, getClientIp } from "@/lib/utils/rate-limit";

describe("rate limiter (in-memory fallback)", () => {
  it("allows requests up to the per-IP limit, then blocks", async () => {
    const ip = "203.0.113.7"; // a unique bucket for this test
    const results = [];
    for (let i = 0; i < 12; i++) {
      results.push(await checkRateLimit(ip));
    }
    // Default per-IP max is 10 per minute.
    expect(results.slice(0, 10).every((r) => r.success)).toBe(true);
    expect(results[10].success).toBe(false);
    expect(results[10].resetAfter).toBeGreaterThan(0);
  });

  it("extracts the client IP from x-forwarded-for", () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "x-forwarded-for": "198.51.100.9, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("198.51.100.9");
  });

  it("falls back to 'unknown' with no proxy headers", () => {
    const req = new Request("http://localhost/api/chat", { method: "POST" });
    expect(getClientIp(req)).toBe("unknown");
  });
});
