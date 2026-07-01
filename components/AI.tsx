import Image from "next/image";

const AISection = () => {
  return (
    <section id="ai" className="container py-24 sm:py-32">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
        <div className="aspect-video w-full overflow-hidden rounded-lg border shadow-lg">
          <Image
            src="/demo.gif"
            alt="Last EHR demo: the agent finds a patient, then records an observation to the chart after the user approves the write"
            width={1512}
            height={789}
            unoptimized
            className="h-full w-full object-cover"
          />
        </div>

        <div>
          <h2 className="text-3xl font-bold md:text-4xl">AI Agents</h2>
          <p className="mb-6 mt-4 text-xl text-muted-foreground">
            The agent reads the chart and, with your approval, writes to it. Add
            a note. Record an observation. Every write needs explicit
            confirmation before it is saved.
          </p>

          <div className="space-y-4 border-l-2 border-border pl-5">
            <p className="text-muted-foreground">
              It runs as the signed-in user and is scoped by your Medplum
              AccessPolicy. It searches patients, opens a chart, and renders the
              results as cards. You can see every tool call it makes.
            </p>
            <p className="text-muted-foreground">
              Writes are gated. The agent proposes a change, you approve it, and
              only then does it reach the chart. Nothing changes without a click.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AISection;
