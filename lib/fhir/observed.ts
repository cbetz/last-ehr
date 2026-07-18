import type {
  Bundle,
  ExtractResource,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";

import type { FhirBackend } from "./backend";

// The dev-output panel's capture seam: a FhirBackend decorator (the
// ScriptedDemoBackend mold) that emits one structured event per operation.
// This is the only seam that covers every adapter uniformly — Medplum's
// SDK bypasses the shared REST transport — and the only one consistent with
// the no-backend-branches rule in lib/ai/tools.ts.
//
// Events are an explicit, bounded carve-out from the repo's scrubbing
// posture (see docs/threat-model.md) and MUST NEVER contain: access tokens
// or auth headers, absolute URLs/hosts (paths are relative), error or
// OperationOutcome diagnostic text, raw response bodies, or the demo
// session id (searchVisible puts it in _tag/_tag:not params, and it is an
// HttpOnly capability token — redacted below). observed.test.ts asserts
// these negatives; treat them as safety-boundary tests.
export type FhirDevEvent = {
  op: "search" | "searchResources" | "create";
  method: "GET" | "POST";
  /**
   * Synthesized the way FhirRestBackend builds its request line, e.g.
   * "/Patient?name=maria&_count=20". For Medplum (and the scripted
   * wrapper's forwarded calls) this is the operation's intent, not wire
   * truth — label it "FHIR operations", never "actual requests".
   */
  path: string;
  /** Outcome only — never the error text. */
  ok: boolean;
  /**
   * HTTP status when a FAILED operation carried one (the REST transport
   * attaches statusCode to its errors) — a bare number, never diagnostics.
   */
  status?: number;
  durationMs: number;
  /** Search ops: matched resources (search-mode "match" rows only). */
  resultCount?: number;
  /** Create ops. */
  resourceType?: string;
  resourceId?: string;
};

function countMatches(bundle: Bundle): number {
  return (bundle.entry ?? []).filter(
    (entry) => !entry.search?.mode || entry.search.mode === "match",
  ).length;
}

/** The numeric statusCode a transport attached to its error, if any. */
function statusOf(error: unknown): number | undefined {
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? (error as { statusCode: unknown }).statusCode
      : undefined;
  return typeof statusCode === "number" ? statusCode : undefined;
}

export class ObservedFhirBackend implements FhirBackend {
  constructor(
    private readonly inner: FhirBackend,
    private readonly onEvent: (event: FhirDevEvent) => void,
    /** Redacted from every emitted path; see the type comment above. */
    private readonly sessionId?: string,
  ) {}

  private path(
    resourceType: string,
    params?: Record<string, string>,
  ): string {
    const query =
      params && Object.keys(params).length > 0
        ? `?${new URLSearchParams(params).toString()}`
        : "";
    let path = `/${resourceType}${query}`;
    if (this.sessionId) {
      path = path.split(this.sessionId).join("redacted");
    }
    // Belt and braces for tag codes that embed a session id in any form.
    return path.replace(/session-[A-Za-z0-9-]+/g, "session-redacted");
  }

  private emit(event: FhirDevEvent): void {
    try {
      this.onEvent(event);
    } catch {
      // A dev-output consumer must never break a chart operation.
    }
  }

  async search<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<Bundle<ExtractResource<K>>> {
    const started = Date.now();
    try {
      const bundle = await this.inner.search(resourceType, params);
      this.emit({
        op: "search",
        method: "GET",
        path: this.path(resourceType, params),
        ok: true,
        durationMs: Date.now() - started,
        resultCount: countMatches(bundle),
      });
      return bundle;
    } catch (error) {
      this.emit({
        op: "search",
        method: "GET",
        path: this.path(resourceType, params),
        ok: false,
        status: statusOf(error),
        durationMs: Date.now() - started,
      });
      throw error;
    }
  }

  async searchResources<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<ExtractResource<K>[]> {
    const started = Date.now();
    try {
      const resources = await this.inner.searchResources(resourceType, params);
      this.emit({
        op: "searchResources",
        method: "GET",
        path: this.path(resourceType, params),
        ok: true,
        durationMs: Date.now() - started,
        resultCount: resources.length,
      });
      return resources;
    } catch (error) {
      this.emit({
        op: "searchResources",
        method: "GET",
        path: this.path(resourceType, params),
        ok: false,
        status: statusOf(error),
        durationMs: Date.now() - started,
      });
      throw error;
    }
  }

  async createResource<T extends Resource>(
    resource: T,
  ): Promise<T & { id: string }> {
    const started = Date.now();
    try {
      const created = await this.inner.createResource(resource);
      this.emit({
        op: "create",
        method: "POST",
        path: this.path(resource.resourceType),
        ok: true,
        durationMs: Date.now() - started,
        resourceType: resource.resourceType,
        resourceId: created.id,
      });
      return created;
    } catch (error) {
      this.emit({
        op: "create",
        method: "POST",
        path: this.path(resource.resourceType),
        ok: false,
        status: statusOf(error),
        durationMs: Date.now() - started,
        resourceType: resource.resourceType,
      });
      throw error;
    }
  }

  // Seeding/admin only, never an agent tool (lib/fhir/backend.ts): delegate
  // without an event so the panel shows exactly the agent-reachable surface.
  deleteResource(resourceType: ResourceType, id: string): Promise<void> {
    return this.inner.deleteResource(resourceType, id);
  }
}
