import { describe, expect, it } from "vitest";

import { classifyMainCi } from "./require-main-ci.mjs";

const sha = "6e1eb11c00147bcc2c4aed330224e8bf73636dbb";

function run(overrides: Record<string, unknown>) {
  return {
    head_sha: sha,
    head_branch: "main",
    event: "push",
    status: "completed",
    conclusion: "success",
    html_url: "https://github.com/cbetz/last-ehr/actions/runs/1",
    ...overrides,
  };
}

describe("main CI classification for publish=true", () => {
  it("accepts a completed successful push to this SHA", () => {
    expect(classifyMainCi([run({})], sha)).toMatchObject({ state: "success" });
  });

  it("reports an in-progress push instead of a missing success", () => {
    const pending = run({
      status: "in_progress",
      conclusion: null,
      html_url: "https://github.com/cbetz/last-ehr/actions/runs/42067672681",
    });
    expect(classifyMainCi([pending], sha)).toEqual({ state: "pending", run: pending });
  });

  it("prefers a successful run when a rerun is still pending", () => {
    const result = classifyMainCi(
      [
        run({ status: "in_progress", conclusion: null, html_url: "https://example.test/pending" }),
        run({ html_url: "https://example.test/success" }),
      ],
      sha,
    );
    expect(result.state).toBe("success");
    expect(result.run?.html_url).toBe("https://example.test/success");
  });

  it("waits when a failed run has a rerun still in progress", () => {
    const result = classifyMainCi(
      [
        run({ conclusion: "failure", html_url: "https://example.test/failed" }),
        run({ status: "queued", conclusion: null, html_url: "https://example.test/queued" }),
      ],
      sha,
    );
    expect(result.state).toBe("pending");
  });

  it("fails a completed unsuccessful push", () => {
    expect(
      classifyMainCi([run({ conclusion: "failure" })], sha).state,
    ).toBe("failed");
  });

  it("ignores other SHAs, branches, and pull_request events", () => {
    expect(
      classifyMainCi(
        [
          run({ head_sha: "other" }),
          run({ head_branch: "cursor/mcp-0-5-1-4fd6" }),
          run({ event: "pull_request" }),
        ],
        sha,
      ).state,
    ).toBe("missing");
  });
});
