import { CableIcon, DatabaseIcon, PartyPopperIcon, SparklesIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface FeatureProps {
  icon: JSX.Element;
  title: string;
  description: string;
}

const features: FeatureProps[] = [
  {
    icon: <DatabaseIcon />,
    title: "Choose a Headless EHR",
    description: "",
  },
  {
    icon: <CableIcon />,
    title: "Choose your integrations",
    description: "",
  },
  {
    icon: <SparklesIcon />,
    title: "Add AI Agents",
    description: "",
  },
  {
    icon: <PartyPopperIcon />,
    title: "Suprise and delight your patients and providers",
    description: "",
  },
];

export const HowItWorks = () => {
  return (
    <section id="howItWorks" className="container text-center py-24 sm:py-32">
      <h2 className="text-3xl md:text-4xl font-bold ">
        <span className="bg-gradient-to-b from-primary/60 to-primary text-transparent bg-clip-text">
          Get Started with Last EHR
        </span>
      </h2>
      <p className="md:w-3/4 mx-auto mt-4 mb-8 text-xl text-muted-foreground">
        {
          "Pick your headless EHR, choose your integrations, and add AI agents. Focus on your secret sauce and let us handle the rest."
        }
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {features.map(({ icon, title, description }: FeatureProps) => (
          <Card key={title} className="bg-muted/50">
            <CardHeader>
              <CardTitle className="grid gap-4 place-items-center">
                {icon}
                {title}
              </CardTitle>
            </CardHeader>
            <CardContent>{description}</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};
