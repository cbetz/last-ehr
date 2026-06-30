import Image from "next/image";

import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { IconSparkles } from "./ui/icons";

interface ServiceProps {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const serviceList: ServiceProps[] = [
  {
    title: "Structured results, not walls of text",
    description:
      "The agent renders patient cards and chart data from live FHIR — with a tool call you can read, not a black box.",
    icon: <IconSparkles className="h-6 w-6 text-blue-500" />,
  },
];

const AISection = () => {
  return (
    <section id="ai" className="container py-24 sm:py-32">
      <div className="grid place-items-center gap-8 lg:grid-cols-2">
        <div className="aspect-video w-full overflow-hidden rounded-lg border shadow-lg">
          <Image
            src="/demo.gif"
            alt="Last EHR demo: the agent finds a patient, then records observations to the chart after the user approves each write"
            width={1512}
            height={789}
            unoptimized
            className="h-full w-full object-cover"
          />
        </div>

        <div>
          <h2 className="text-3xl font-bold md:text-4xl">
            <span className="bg-gradient-to-b from-primary/60 to-primary bg-clip-text text-transparent">
              AI Agents
            </span>
          </h2>

          <p className="mb-8 mt-4 text-xl text-muted-foreground">
            Ask in plain language. The agent reads the chart and — with your
            approval — writes to it: add a note, record an observation.
          </p>

          <div className="flex flex-col gap-8">
            {serviceList.map(({ icon, title, description }: ServiceProps) => (
              <Card key={title}>
                <CardHeader className="flex items-start justify-start gap-4 space-y-1 md:flex-row">
                  <div className="mt-1 rounded-2xl bg-primary/20 p-3">
                    {icon}
                  </div>
                  <div>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription className="mt-2 text-base">
                      {description}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AISection;
