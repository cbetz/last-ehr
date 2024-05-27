import Image from "next/image";
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { IconSparkles } from "./ui/icons";

interface ServiceProps {
  title: string;
  description: string;
  icon: JSX.Element;
}

const serviceList: ServiceProps[] = [
  {
    title: "Generative UI",
    description:
      "Not just a chatbot, but a full-fledged AI agent that can generate UI components.",
    icon: <IconSparkles className="h-6 w-6 text-blue-500" />,
  },
];

const AI = () => {
  return (
    <section id="ai" className="container py-24 sm:py-32">
      <div className="grid lg:grid-cols-[1fr,1fr] gap-8 place-items-center">
        <Image
          src="/demo.png"
          className="w-[300px] md:w-[500px] lg:w-[600px] object-contain"
          alt="AI demo"
          height="225"
          width="400"
        />
        <div>
          <h2 className="text-3xl md:text-4xl font-bold">
            <span className="bg-gradient-to-b from-primary/60 to-primary text-transparent bg-clip-text">
              AI Agents{" "}
            </span>
          </h2>

          <p className="text-muted-foreground text-xl mt-4 mb-8 ">
            Change the way you interact with your EHR with AI agents.
          </p>

          <div id="signup" className="flex flex-col gap-8">
            {serviceList.map(({ icon, title, description }: ServiceProps) => (
              <Card key={title}>
                <CardHeader className="space-y-1 flex md:flex-row justify-start items-start gap-4">
                  <div className="mt-1 bg-primary/20 p-3 rounded-2xl">
                    {icon}
                  </div>
                  <div>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription className="text-md mt-2">
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

export default AI;
