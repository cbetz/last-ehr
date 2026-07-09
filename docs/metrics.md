# Adoption Metrics

Last EHR has two funnels that should be measured separately.

## OSS adoption funnel

Useful events:

- Demo started.
- Starter prompt clicked.
- First patient search completed.
- First chart opened.
- First approval card shown.
- First write approved or canceled.
- GitHub clicked.
- Docs clicked.
- Quickstart command copied, if a copy button is added later.

The goal is not raw traffic. The goal is more evaluators reaching the approval
moment and then successfully running the project locally.

## Hosted-interest funnel

Useful events:

- Waitlist form viewed.
- Waitlist form submitted.
- Referrer and landing page.

Keep this separate from OSS adoption. Someone joining a hosted waitlist is not
the same as someone who cloned the repo and verified the local demo.

## Privacy rules

- Never capture chart content.
- Never capture patient names, notes, observation values, or resource ids.
- Event properties should be names, booleans, counts, or static labels only.
