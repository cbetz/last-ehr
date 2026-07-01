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
    icon: <Database className="h-5 w-5" aria-hidden="true" />,
    title: "Runs on your FHIR backend",
    description:
      "Point it at your own Medplum, hosted or self-hosted. Last EHR talks to it over FHIR and keeps no copy of your data.",
  },
  {
    icon: <KeyRound className="h-5 w-5" aria-hidden="true" />,
    title: "Bring your own model key",
    description:
      "OpenAI or Anthropic, your key and your spend. Switch models with a single environment variable.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" aria-hidden="true" />,
    title: "Permissioned by your AccessPolicy",
    description:
      "The agent runs as the signed-in user, scoped by Medplum's access controls. It can't see what you can't.",
  },
  {
    icon: <GitBranch className="h-5 w-5" aria-hidden="true" />,
    title: "Self-host, Apache-2.0",
    description:
      "Clone it and run it in minutes. Apache-2.0 licensed, and no account is required to get started.",
  },
];

export const HowItWorks = () => {
  return (
    <section id="howItWorks" className="container py-24 sm:py-32">
      <h2 className="text-3xl font-bold md:text-4xl">How it works</h2>
      <p className="mb-12 mt-4 max-w-2xl text-xl text-muted-foreground">
        Last EHR is a thin, open-source layer over a FHIR backend you already
        control. Clone it, point it at your Medplum, and bring your own model
        key.
      </p>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon, title, description }: FeatureProps) => (
          <Card key={title} className="border-border bg-transparent">
            <CardHeader className="space-y-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground">
                {icon}
              </div>
              <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
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
