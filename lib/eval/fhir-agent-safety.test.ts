import type {
  Bundle,
  ExtractResource,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";
import { describe, expect, it } from "vitest";

import type { FhirBackend } from "@/lib/fhir/backend";

import { runFhirAgentSafetyEval } from "./fhir-agent-safety";

class MemoryFhirBackend implements FhirBackend {
  private readonly resources = new Map<ResourceType, Resource[]>();
  private nextId = 1;

  private list(resourceType: ResourceType): Resource[] {
    return this.resources.get(resourceType) ?? [];
  }

  private matches(
    resource: Resource,
    resourceType: ResourceType,
    params: Record<string, string> = {},
  ): boolean {
    if (params._id && resource.id !== params._id) return false;

    if (resourceType === "Patient") {
      const patient = resource as ExtractResource<"Patient">;
      if (params.identifier) {
        const [system, value] = params.identifier.split("|");
        if (
          !patient.identifier?.some(
            (identifier) =>
              identifier.system === system && identifier.value === value,
          )
        ) {
          return false;
        }
      }
      if (params.name) {
        const name = patient.name
          ?.flatMap((entry) => [...(entry.given ?? []), entry.family ?? ""])
          .join(" ")
          .toLowerCase();
        if (!name?.includes(params.name.toLowerCase())) return false;
      }
    }

    if (params.patient) {
      const reference =
        (resource as { subject?: { reference?: string } }).subject?.reference ??
        (resource as { patient?: { reference?: string } }).patient?.reference;
      if (reference !== `Patient/${params.patient}`) return false;
    }
    if (params.subject) {
      const reference = (resource as { subject?: { reference?: string } }).subject
        ?.reference;
      if (reference !== params.subject) return false;
    }

    return true;
  }

  async search<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<Bundle<ExtractResource<K>>> {
    const entries = this.list(resourceType)
      .filter((resource) => this.matches(resource, resourceType, params))
      .map((resource) => ({ resource: resource as ExtractResource<K> }));

    return {
      resourceType: "Bundle",
      type: "searchset",
      total: entries.length,
      entry: entries,
    } as Bundle<ExtractResource<K>>;
  }

  async searchResources<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<ExtractResource<K>[]> {
    return this.list(resourceType)
      .filter((resource) => this.matches(resource, resourceType, params))
      .map((resource) => resource as ExtractResource<K>);
  }

  async createResource<T extends Resource>(
    resource: T,
  ): Promise<T & { id: string }> {
    const created = {
      ...resource,
      id: resource.id ?? `${resource.resourceType.toLowerCase()}-${this.nextId++}`,
    } as T & { id: string };
    this.resources.set(resource.resourceType, [
      ...this.list(resource.resourceType),
      created,
    ]);
    return created;
  }

  async deleteResource(resourceType: ResourceType, id: string): Promise<void> {
    this.resources.set(
      resourceType,
      this.list(resourceType).filter((resource) => resource.id !== id),
    );
  }

  count(): number {
    return [...this.resources.values()].flat().length;
  }
}

describe("FHIR Agent Safety Eval", () => {
  it("runs the deterministic proposal, approval, denial, and chart-association checks", async () => {
    const backend = new MemoryFhirBackend();
    const report = await runFhirAgentSafetyEval({
      confirmSyntheticTarget: true,
      createBackend: () => backend,
      now: () => new Date("2026-07-11T00:00:00.000Z"),
    });

    expect(report.schemaVersion).toBe("1");
    expect(report.target).toBe("synthetic-disposable");
    expect(report.status).toBe("pass");
    expect(report.checks.map((check) => [check.id, check.status])).toEqual([
      ["synthetic-target", "pass"],
      ["search-and-chart-read", "pass"],
      ["proposal-gate", "pass"],
      ["approved-write", "pass"],
      ["denied-write", "pass"],
      ["chart-association-isolation", "pass"],
      ["cleanup", "pass"],
    ]);
    expect(backend.count()).toBe(0);
  });

  it("keeps portable reports free of generated chart identifiers and backend errors", async () => {
    const backend = new MemoryFhirBackend();
    const report = await runFhirAgentSafetyEval({
      confirmSyntheticTarget: true,
      createBackend: () => backend,
      now: () => new Date("2026-07-11T00:00:00.000Z"),
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("patient-");
    expect(serialized).not.toContain("observation-");
    expect(serialized).not.toContain("SafetyEval");
  });

  it("fails closed before creating a backend without explicit synthetic-target confirmation", async () => {
    let createBackendCalled = false;
    const unsafeOptions = {
      confirmSyntheticTarget: false,
      createBackend: () => {
        createBackendCalled = true;
        return new MemoryFhirBackend();
      },
    } as unknown as Parameters<typeof runFhirAgentSafetyEval>[0];

    await expect(runFhirAgentSafetyEval(unsafeOptions)).rejects.toThrow(
      "confirmSyntheticTarget: true",
    );
    expect(createBackendCalled).toBe(false);
  });
});
