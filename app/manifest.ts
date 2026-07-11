import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Last EHR: Open-source approval-gated FHIR agents",
    short_name: "Last EHR",
    description:
      "An open-source reference implementation for approval-gated FHIR agents. The agent reads the chart and proposes writes; nothing is saved until you approve it.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1020",
    theme_color: "#0b1020",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  };
}
