import { expect, test } from "@playwright/test";

// A phone must never scroll sideways. This regressed once already: the
// homepage's MCP and hero cards hold `<pre>` blocks whose command lines cannot
// wrap, and their grids declared columns only at the `sm:` breakpoint. Below
// that the single column is `auto`, whose minimum is min-content, so the
// unbreakable line set the column to 456px on a 390px screen and pushed the
// whole document sideways — the header, headings, and every section shifted
// off the left edge together.
//
// The `overflow-x: auto` already on those `<pre>` elements did not help,
// because a scroll container only scrolls once something squeezes it.
//
// Asserted against the document rather than against CSS classes: this is the
// invariant, and it holds however the layout is expressed.

const PHONE = { width: 390, height: 844 };

// Public pages that carry wide, unbreakable content: shell commands, code
// samples, and wide tables.
const pages = [
  { path: "/", name: "homepage" },
  { path: "/demo", name: "demo" },
  { path: "/docs/fhir-coverage", name: "coverage doc (wide tables)" },
  { path: "/docs/mcp", name: "MCP doc (shell commands)" },
];

test.describe("no horizontal overflow on a phone", () => {
  test.use({ viewport: PHONE });

  for (const { path, name } of pages) {
    test(`${name} fits the viewport`, async ({ page }) => {
      await page.goto(path);
      // Fonts and any client-side layout settle first, or a transient wide
      // frame could pass or fail arbitrarily.
      await page.waitForLoadState("networkidle");

      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const scrollWidth = Math.max(de.scrollWidth, document.body.scrollWidth);
        // Name the widest offending element so a failure is actionable rather
        // than just a number. Elements inside a scroll container are excluded:
        // those are the ones behaving correctly.
        let widest: { tag: string; cls: string; right: number } | null = null;
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
          let scrolls = false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const ox = getComputedStyle(p).overflowX;
            if (ox === "auto" || ox === "scroll" || ox === "hidden") {
              scrolls = true;
              break;
            }
          }
          if (scrolls) continue;
          const right = Math.round(el.getBoundingClientRect().right);
          if (right > de.clientWidth + 1 && (!widest || right > widest.right)) {
            widest = {
              tag: el.tagName.toLowerCase(),
              cls: String(el.className).slice(0, 90),
              right,
            };
          }
        }
        return { scrollWidth, clientWidth: de.clientWidth, widest };
      });

      expect(
        overflow.scrollWidth,
        `${name} scrolls horizontally by ${overflow.scrollWidth - overflow.clientWidth}px; widest element: ${JSON.stringify(overflow.widest)}`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  }
});
