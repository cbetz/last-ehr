import Link from "next/link";

export function GrokWalkthrough() {
  return (
    <section id="grok-walkthrough" className="border-b marketing-rule bg-muted/20">
      <div className="container grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-16">
        <div>
          <p className="section-kicker">Grok Bot</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
            Grok drafts. You approve. Last verifies the save.
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            A 43-second edited walkthrough from actual Grok Bot and Last
            screenshots. Grok drafts a follow-up from a synthetic chart, a
            person approves it in Last, and Grok retrieves the saved Task
            receipt. The request needed a connector-name clarification. Patient
            data is invented. No one was contacted.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm underline underline-offset-4">
            <a href="/demo/grok-work.mp4">Watch full size</a>
            <Link href="/docs/grok-bot#recorded-grok-walkthrough">Transcript and setup</Link>
            <a href="/demo/grok-work.proof.json">Verification notes (JSON)</a>
          </div>
        </div>
        <figure className="min-w-0 border border-border bg-card">
          <figcaption className="border-b border-border px-5 py-4 font-mono text-xs text-muted-foreground">
            43 seconds · Grok Bot + Last · Synthetic data
          </figcaption>
          <video
            className="aspect-video w-full bg-black"
            controls
            playsInline
            preload="none"
            poster="/demo/grok-work.png"
            width={1920}
            height={1080}
            aria-label="Grok drafts a follow-up, a human approves it in Last, and Grok retrieves the saved Task receipt"
          >
            <source src="/demo/grok-work.mp4" type="video/mp4" />
            <track kind="captions" src="/demo/grok-work.vtt" srcLang="en" label="English" />
            <a href="/demo/grok-work.mp4">Download the walkthrough</a>
          </video>
        </figure>
      </div>
    </section>
  );
}
