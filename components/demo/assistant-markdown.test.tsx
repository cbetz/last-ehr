import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AssistantMarkdown } from "@/components/demo/assistant-markdown";

// Safety-boundary tests. Assistant prose is model output, and chart free text
// reaches the model as data, so anything a note or document could smuggle into
// that prose must be inert once rendered.

// Static markup rather than a DOM: these assertions are all about what markup
// is produced, so the suite needs no jsdom and no new dependency.
const html = (markdown: string) =>
  renderToStaticMarkup(<AssistantMarkdown>{markdown}</AssistantMarkdown>);

/** Visible text with tags stripped, for "the asterisks are gone" assertions. */
const text = (markdown: string) =>
  html(markdown)
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

describe("AssistantMarkdown", () => {
  it("renders the formatting the model actually emits", () => {
    // The bug: a chart summary showed the reader literal ** and pipe rows.
    expect(html("**CVX 88** is *likely* yes")).toContain("<strong");
    expect(html("**CVX 88** is *likely* yes")).toContain("<em");
    expect(html("- one\n- two")).toContain("<li");
    expect(html("| Date | Vaccine |\n| --- | --- |\n| 2025-10-10 | Flu |")).toContain(
      "<table",
    );
    expect(html("`codeFilterUnmatched` is set")).toContain("<code");
    // ...and the asterisks are gone from the visible text.
    expect(text("**bold**")).toBe("bold");
  });

  it("never renders raw HTML from the stream", () => {
    // rehype-raw is deliberately absent. A note echoed into assistant prose
    // must not become markup.
    const out = html('<img src=x onerror="alert(1)"><script>alert(2)</script>');
    // Escaped, therefore inert: the reader sees the characters and the browser
    // sees no element. Note "onerror" DOES appear in the output as escaped
    // text, which is the point — what must not appear is a live attribute.
    expect(out).toContain("&lt;img");
    expect(out).not.toMatch(/<img|<script/);
    expect(out).not.toContain('onerror="');
  });

  it("keeps the chart-text boundary visible as characters, not an element", () => {
    // The boundary is how the system prompt tells the model what is quoted
    // chart content. If it silently became an unknown element the reader would
    // lose the marker entirely.
    const out = html("<chart_text>follow up in two weeks</chart_text>");
    expect(out).not.toContain("<chart_text");
    expect(text("<chart_text>x</chart_text>")).toContain("chart_text");
  });

  it("renders link text but never a clickable link", () => {
    // A link whose label and target disagree is the oldest trick there is, and
    // a clinician clicking one out of a chart summary is the outcome to avoid.
    const out = html("[the patient portal](https://evil.example/steal)");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("evil.example");
    expect(text("[the patient portal](https://evil.example)")).toBe(
      "the patient portal",
    );
  });

  it("drops images, so nothing makes an outbound request the reader did not ask for", () => {
    // A tracking pixel addressed by patient id is a leak.
    const out = html("![](https://tracker.example/p/1933.png)");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("tracker.example");
  });

  it("flattens headings so a bubble cannot restyle itself into a document", () => {
    const out = html("# Summary\n## Details");
    expect(out).not.toMatch(/<h[1-6]/);
    expect(text("# Summary")).toBe("Summary");
  });

  it("scrolls wide content inside its own box, never the page", () => {
    // The mobile overflow rule: a long code line or a wide table must not
    // widen the viewport.
    expect(html("```\n" + "x".repeat(200) + "\n```")).toContain("overflow-x-auto");
    expect(html("| a | b |\n| --- | --- |\n| 1 | 2 |")).toContain("overflow-x-auto");
  });
});
