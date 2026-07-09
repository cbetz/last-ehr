import Link from "next/link";

import { Button } from "@/components/ui/button";
import { IconArrowRight } from "@/components/ui/icons";
import { track } from "@/lib/analytics";

// A write leads so first-time visitors reach the approval gate (the thing
// this demo exists to show) on their first click.
const exampleMessages = [
  {
    heading: "Record a vital (with approval)",
    message: "Record a heart rate of 72 bpm for Maria Garcia",
  },
  {
    heading: "Find a patient",
    message: "Find patients named Smith",
  },
  {
    heading: "Review a chart",
    message: "Show me Maria Garcia's chart",
  },
  {
    heading: "Add a note (with approval)",
    message:
      "Add a note to Maria Garcia's chart that she reports feeling well with no complaints",
  },
];

export function EmptyScreen({
  submitMessage,
}: {
  submitMessage: (message: string) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4">
      <div className="mb-4 rounded-lg border bg-background p-6 sm:p-8">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Try the approval loop</h1>
          <p className="leading-normal text-muted-foreground">
            Search a synthetic chart, open the record, then watch a proposed
            write stop at the approval card before anything saves.
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {["Search", "Review", "Approve"].map((label, index) => (
            <div key={label} className="rounded-md border bg-muted/40 p-3">
              <div className="font-mono text-xs text-muted-foreground">
                0{index + 1}
              </div>
              <div className="mt-1 text-sm font-medium">{label}</div>
            </div>
          ))}
        </div>

        <p className="mt-6 leading-normal text-muted-foreground">
          Start with one of these:
        </p>
        <div className="mb-5 mt-4 flex flex-col items-start space-y-2">
          {exampleMessages.map((message, index) => (
            <Button
              key={index}
              variant="link"
              className="h-auto p-0 text-base"
              onClick={async () => {
                track("demo_starter_clicked", { heading: message.heading });
                submitMessage(message.message);
              }}
            >
              <IconArrowRight className="mr-2 text-muted-foreground" />
              {message.heading}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-sm text-muted-foreground">
          <Link
            href="/docs"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Run it locally
          </Link>
          <Link
            href="/approval-gated-writes"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Read the approval contract
          </Link>
          <Link
            href="https://github.com/cbetz/last-ehr"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-4"
          >
            View source
          </Link>
        </div>
      </div>
    </div>
  );
}
