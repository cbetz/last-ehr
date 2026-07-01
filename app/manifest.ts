import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Last EHR: Open-source AI agent layer for Medplum and FHIR",
    short_name: "Last EHR",
    description:
      "An open-source AI agent layer over your FHIR backend. The agent reads the chart and proposes writes; nothing is saved until you approve it.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1120",
    theme_color: "#0b1120",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  };
}
