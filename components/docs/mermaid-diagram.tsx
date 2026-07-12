"use client";

import { useEffect, useId, useState } from "react";

type MermaidDiagramProps = {
  code: string;
};

export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const id = `lastehr-mermaid-${useId().replace(/:/g, "")}`;
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        });
        const result = await mermaid.render(id, code);

        if (!cancelled) {
          setSvg(result.svg);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return (
      <details className="my-6 border border-border bg-muted/25 p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-foreground">
          Diagram source
        </summary>
        <pre className="mt-4 overflow-x-auto bg-[#101219] p-4 font-mono text-xs leading-6 text-[#eef3ff]">
          <code>{code}</code>
        </pre>
      </details>
    );
  }

  return (
    <div className="my-6 overflow-x-auto border border-border bg-card p-4 sm:p-6">
      {svg ? (
        <div
          className="min-w-[34rem] [&_svg]:h-auto [&_svg]:max-w-none"
          // Mermaid renders source-controlled repository diagrams with strict security.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="h-48 animate-pulse bg-muted/70" aria-label="Rendering architecture diagram" />
      )}
    </div>
  );
}
