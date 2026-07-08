import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the Medplum client so adapter tests never hit a real server.
// vi.hoisted ensures these exist before the (hoisted) vi.mock factory runs.
const { createResource, search, searchResources, deleteResource, clientOptions } =
  vi.hoisted(() => ({
    createResource: vi.fn(),
    search: vi.fn(),
    searchResources: vi.fn(),
    deleteResource: vi.fn(),
    clientOptions: vi.fn(),
  }));

vi.mock("@medplum/core", () => ({
  // A class so `new MedplumClient(...)` is constructable.
  MedplumClient: class {
    constructor(options: unknown) {
      clientOptions(options);
    }
    createResource = createResource;
    search = search;
    searchResources = searchResources;
    deleteResource = deleteResource;
  },
}));

import { MedplumBackend } from "@/lib/fhir/medplum";

describe("MedplumBackend", () => {
  beforeEach(() => {
    clientOptions.mockReset();
    search.mockReset();
    searchResources.mockReset();
    createResource.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to the hosted API when MEDPLUM_BASE_URL is unset or empty", () => {
    vi.stubEnv("MEDPLUM_BASE_URL", "");
    new MedplumBackend("tok");
    expect(clientOptions).toHaveBeenCalledWith({
      accessToken: "tok",
      baseUrl: undefined,
    });
  });

  it("passes a configured base URL through", () => {
    vi.stubEnv("MEDPLUM_BASE_URL", "https://fhir.example.com");
    new MedplumBackend("tok");
    expect(clientOptions).toHaveBeenCalledWith({
      accessToken: "tok",
      baseUrl: "https://fhir.example.com",
    });
  });

  it("delegates search, searchResources, and createResource to the client", async () => {
    search.mockResolvedValue({ resourceType: "Bundle", entry: [] });
    searchResources.mockResolvedValue([]);
    createResource.mockImplementation(async (r) => r);
    const backend = new MedplumBackend("tok");

    await backend.search("Patient", { name: "smith" });
    expect(search).toHaveBeenCalledWith("Patient", { name: "smith" });

    await backend.searchResources("Condition", { patient: "p1" });
    expect(searchResources).toHaveBeenCalledWith("Condition", {
      patient: "p1",
    });

    const obs = { resourceType: "Observation" as const, status: "final" };
    await backend.createResource(obs as never);
    expect(createResource).toHaveBeenCalledWith(obs);

    deleteResource.mockResolvedValue(undefined);
    await backend.deleteResource("Observation", "obs-1");
    expect(deleteResource).toHaveBeenCalledWith("Observation", "obs-1");
  });
});
