import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DRY_RUN_OUTCOME } from "@/lib/fhir/dry-run-result";

import { ApprovedWriteNotice } from "./approved-write-notice";

describe("ApprovedWriteNotice", () => {
  it("keeps the persisted success copy", () => {
    const html = renderToStaticMarkup(
      <ApprovedWriteNotice
        persistedMessage="Observation recorded."
        output={{ id: "obs-1", resourceType: "Observation" }}
      />,
    );
    expect(html).toContain("✓ Observation recorded.");
    expect(html).not.toContain("dry-run");
    expect(html).not.toContain("<pre");
  });

  it("shows the staged diff and does not say the chart was updated", () => {
    const html = renderToStaticMarkup(
      <ApprovedWriteNotice
        persistedMessage="Observation recorded."
        output={{
          persisted: false,
          dryRun: true,
          diff: '+++ staged Observation (not written)\n+{"resourceType":"Observation"}',
          outcome: DRY_RUN_OUTCOME,
        }}
      />,
    );
    expect(html).toContain(DRY_RUN_OUTCOME);
    expect(html).toContain("not written");
    expect(html).not.toContain("Observation recorded.");
    expect(html).toContain("<pre");
  });
});
