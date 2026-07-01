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
      <div className="rounded-lg border bg-background p-8 mb-4">
        <h1 className="mb-2 text-lg font-semibold">Last EHR</h1>
        <p className="mb-2 leading-normal text-muted-foreground">
          This is a demo of our interactive EHR assistant, connected to a
          live Headless EHR. 
        </p>
        <p className="leading-normal text-muted-foreground">Try an example:</p>
        <div className="mt-4 flex flex-col items-start space-y-2 mb-4">
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
      </div>
      {/*<FooterText />*/}
    </div>
  );
}
