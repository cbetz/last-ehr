import { AsyncLocalStorage } from "node:async_hooks";

import type { RequestId } from "@modelcontextprotocol/sdk/types.js";

/**
 * The JSON-RPC id of the tools/call currently being served, carried from the
 * MCP request handler to the approval without threading it through the tool
 * contract. Tools stay transport-agnostic; only the MCP layer reads this.
 *
 * Why it exists: over streamable HTTP the SDK routes a server->client request
 * onto the originating request's SSE stream only when `relatedRequestId` is
 * set, and onto the standalone GET stream otherwise. An approval sent with no
 * related id therefore reaches only hosts that happen to keep a GET stream
 * open; every other host never sees the prompt and every write fails closed
 * after the request timeout. Found by adversarial review of the remote
 * transport; the fix is to make the approval ride the tools/call it belongs
 * to, which is also what the MCP spec says SHOULD happen. Over stdio there is
 * one stream and the option is harmless.
 */
const store = new AsyncLocalStorage<{ requestId: RequestId }>();

export function runWithRequestContext<T>(requestId: RequestId, fn: () => Promise<T>): Promise<T> {
  return store.run({ requestId }, fn);
}

export function currentRequestId(): RequestId | undefined {
  return store.getStore()?.requestId;
}
