import { describe, expect, it } from "vitest";

import { currentRequestId, runWithRequestContext } from "./request-context.js";

describe("request context", () => {
  it("is empty outside a request", () => {
    expect(currentRequestId()).toBeUndefined();
  });

  it("carries the request id through awaited work and back out", async () => {
    const seen = await runWithRequestContext(42, async () => {
      await Promise.resolve();
      const inner = currentRequestId();
      await new Promise((r) => setTimeout(r, 1));
      return [inner, currentRequestId()];
    });
    expect(seen).toEqual([42, 42]);
    expect(currentRequestId()).toBeUndefined();
  });

  it("keeps concurrent requests apart", async () => {
    const [a, b] = await Promise.all([
      runWithRequestContext("a", async () => {
        await new Promise((r) => setTimeout(r, 5));
        return currentRequestId();
      }),
      runWithRequestContext("b", async () => {
        await new Promise((r) => setTimeout(r, 1));
        return currentRequestId();
      }),
    ]);
    expect([a, b]).toEqual(["a", "b"]);
  });
});
