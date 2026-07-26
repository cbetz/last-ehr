import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  // tsconfig keeps jsx: "preserve" for Next's own compiler, which vitest
  // cannot execute. Transform JSX here so component markup can be asserted on
  // (see components/demo/assistant-markdown.test.tsx) without adding jsdom:
  // those tests render to static markup, so the node environment still fits.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
  },
});
