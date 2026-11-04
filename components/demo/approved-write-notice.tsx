import { BotMessage } from "@/components/chat";
import { describeApprovedWriteOutput } from "@/lib/fhir/dry-run-result";

/**
 * Result of an approval-gated write. A persisted write keeps its success
 * copy. A dry-run result shows the staged diff and does not say the chart
 * was updated.
 */
export function ApprovedWriteNotice({
  persistedMessage,
  output,
}: {
  persistedMessage: string;
  output: unknown;
}) {
  const described = describeApprovedWriteOutput(persistedMessage, output);
  return (
    <BotMessage>
      {described.persisted ? `✓ ${described.message}` : described.message}
      {described.diff ? (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted p-2 font-mono text-xs">
          {described.diff}
        </pre>
      ) : null}
    </BotMessage>
  );
}
