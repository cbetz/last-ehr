import Link from "next/link";
import { Database, GitBranch, KeyRound, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface FeatureProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const features: FeatureProps[] = [
  {
    icon: <Database aria-hidden="true" />,
    title: "Runs on your FHIR backend",
    description:
      "Point it at your own Medplum — hosted or self-hosted. Last EHR talks to it over FHIR and keeps no copy of your data.",
  },
  {
    icon: <KeyRound aria-hidden="true" />,
    title: "Bring your own model key",
    description:
      "OpenAI or Anthropic, your key and your spend. Switch models with a single environment variable.",
  },
  {
    icon: <ShieldCheck aria-hidden="true" />,
    title: "Permissioned by your AccessPolicy",
    description:
      "The agent runs as the signed-in user, scoped by Medplum's access controls — it can't see what you can't.",
  },
  {
    icon: <GitBranch aria-hidden="true" />,
    title: "Self-host, Apache-2.0",
    description:
      "Clone it and run it in minutes. Open source, no lock-in, and no account required to get started.",
  },
];

export const HowItWorks = () => {
  return (
    <section id="howItWorks" className="container py-24 text-center sm:py-32">
      <h2 className="text-3xl font-bold md:text-4xl">
        <span className="bg-gradient-to-b from-primary/60 to-primary bg-clip-text text-transparent">
          How it works
        </span>
      </h2>
      <p className="mx-auto mb-8 mt-4 text-xl text-muted-foreground md:w-3/4">
        Last EHR is a thin, open-source layer over a FHIR backend you already
        control. Clone it, point it at your Medplum, and bring your own model
        key.
      </p>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon, title, description }: FeatureProps) => (
          <Card key={title} className="bg-muted/50">
            <CardHeader>
              <CardTitle className="grid place-items-center gap-4">
                {icon}
                {title}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              {description}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-10 text-muted-foreground">
        New to the concept?{" "}
        <Link
          href="/headless-ehr"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Learn what a headless EHR is →
        </Link>
      </p>
    </section>
  );
};
