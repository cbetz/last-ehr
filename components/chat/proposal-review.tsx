import {
  NO_CITED_EVIDENCE,
  NO_SESSION_READS,
  NOT_IN_SESSION_READS,
  diffProposedCreate,
  reviewCitations,
  type CitedEvidence,
  type SessionRead,
} from "@/packages/mcp/src/proposal-evidence";

/**
 * The proposed create, as a diff, beside the resources the agent cited and
 * the ones already read in this session. A missing citation is a review cue.
 * It does not decide the write.
 */
export function ProposalReview({
  proposed,
  cited = [],
  sessionReads,
  readsTruncated = false,
}: {
  proposed?: unknown;
  cited?: CitedEvidence[];
  sessionReads?: SessionRead[];
  readsTruncated?: boolean;
}) {
  const reviews = reviewCitations(cited, sessionReads ?? []);
  const citedReferences = new Set(reviews.map((item) => item.reference));
  return (
    <div className="space-y-2">
      {reviews.length === 0 ? (
        <p className="rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-950 dark:text-amber-100">
          {NO_CITED_EVIDENCE}
        </p>
      ) : null}
      <div className={proposed !== undefined ? "grid gap-3 sm:grid-cols-2" : undefined}>
        {proposed !== undefined ? (
          <section className="min-w-0 space-y-1">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Proposed change
            </h4>
            <pre className="max-h-72 max-w-full overflow-auto whitespace-pre rounded-md border bg-muted/60 p-2 font-mono text-[11px] leading-relaxed text-foreground">
              {diffProposedCreate(proposed)}
            </pre>
          </section>
        ) : null}
        <section className="min-w-0 space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Evidence
          </h4>
          {reviews.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Cited</p>
              {reviews.map((item) => (
                <ResourceDetails
                  key={item.reference}
                  reference={item.reference}
                  reason={item.reason}
                  keyFields={item.keyFields}
                  note={item.inSession ? undefined : NOT_IN_SESSION_READS}
                  open
                />
              ))}
            </div>
          ) : null}
          {sessionReads ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Read before this proposal</p>
              {sessionReads.length === 0 ? (
                <p className="text-xs text-muted-foreground">{NO_SESSION_READS}</p>
              ) : (
                sessionReads.map((read, index) => (
                  <ResourceDetails
                    key={read.reference}
                    reference={read.reference}
                    tool={read.tool}
                    keyFields={read.keyFields}
                    note={citedReferences.has(read.reference) ? "Cited above." : undefined}
                    open={reviews.length === 0 && index === 0}
                  />
                ))
              )}
              {readsTruncated ? (
                <p className="text-xs text-muted-foreground">
                  Only the latest resources read in this session are listed.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ResourceDetails({
  reference,
  reason,
  tool,
  keyFields,
  note,
  open,
}: {
  reference: string;
  reason?: string;
  tool?: string;
  keyFields: { label: string; value: string }[];
  note?: string;
  open?: boolean;
}) {
  return (
    <details open={open} className="rounded-md border bg-background">
      <summary className="cursor-pointer px-3 py-2 text-xs">
        <span className="font-mono">{reference}</span>
        {tool ? <span className="text-muted-foreground"> · {tool}</span> : null}
        {reason ? <span className="mt-1 block text-muted-foreground">{reason}</span> : null}
      </summary>
      {keyFields.length > 0 ? (
        <dl className="space-y-1 border-t px-3 py-2 text-xs">
          {keyFields.map((field) => (
            <div key={`${field.label}-${field.value}`} className="flex gap-2">
              <dt className="w-16 shrink-0 text-muted-foreground">{field.label}</dt>
              <dd className="min-w-0 break-words text-foreground">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : note ? null : (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          No key fields from a read in this session.
        </p>
      )}
      {note ? <p className="border-t px-3 py-2 text-xs text-foreground">{note}</p> : null}
    </details>
  );
}
