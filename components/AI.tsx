import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { IconSparkles } from "./ui/icons";

interface ServiceProps {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const serviceList: ServiceProps[] = [
  {
    title: "Generative UI",
    description:
      "Not just a chatbot — a full-fledged AI agent that generates real UI components from your data.",
    icon: <IconSparkles className="h-6 w-6 text-blue-500" />,
  },
];

const AISection = () => {
  return (
    <section id="ai" className="container py-24 sm:py-32">
      <div className="grid place-items-center gap-8 lg:grid-cols-2">
        <div className="aspect-video w-full overflow-hidden rounded-lg border shadow-lg">
          <iframe
            className="h-full w-full"
            src="https://www.youtube-nocookie.com/embed/IzNyf5qH2MA"
            title="Last EHR AI agent demo"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        <div>
          <h2 className="text-3xl font-bold md:text-4xl">
            <span className="bg-gradient-to-b from-primary/60 to-primary bg-clip-text text-transparent">
              AI Agents
            </span>
          </h2>

          <p className="mb-8 mt-4 text-xl text-muted-foreground">
            Change the way you interact with your EHR with AI agents.
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
