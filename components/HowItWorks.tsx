import Link from "next/link";
import {
  CableIcon,
  DatabaseIcon,
  PartyPopperIcon,
  SparklesIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface FeatureProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const features: FeatureProps[] = [
  {
    icon: <DatabaseIcon aria-hidden="true" />,
    title: "Choose a Headless EHR",
    description:
      "Start from a FHIR-native, compliance-ready headless EHR instead of building data infrastructure from scratch.",
  },
  {
    icon: <CableIcon aria-hidden="true" />,
    title: "Choose your integrations",
    description:
      "Connect labs, billing, scheduling, and the tools your team already relies on.",
  },
  {
    icon: <SparklesIcon aria-hidden="true" />,
    title: "Add AI Agents",
    description:
      "Drop in AI agents that chart, summarize, and surface the right patient information on demand.",
  },
  {
    icon: <PartyPopperIcon aria-hidden="true" />,
    title: "Delight patients and providers",
    description:
      "Ship the experience that sets you apart — and let Last EHR handle the rest.",
  },
];

export const HowItWorks = () => {
  return (
    <section id="howItWorks" className="container py-24 text-center sm:py-32">
      <h2 className="text-3xl font-bold md:text-4xl">
        <span className="bg-gradient-to-b from-primary/60 to-primary bg-clip-text text-transparent">
          Get Started with Last EHR
        </span>
      </h2>
      <p className="mx-auto mb-8 mt-4 text-xl text-muted-foreground md:w-3/4">
        Pick your headless EHR, choose your integrations, and add AI agents.
        Focus on your secret sauce and let us handle the rest.
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
