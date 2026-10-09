import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Last EHR: AI tools for FHIR patient charts",
    short_name: "Last EHR",
    description:
      "Open-source AI tools for reading FHIR patient charts and reviewing proposed notes, observations, and tasks before they save.",
    start_url: "/",
    display: "standalone",
    background_color: "#101219",
    theme_color: "#101219",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  };
}
