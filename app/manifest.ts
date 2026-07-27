import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Last EHR: the open-source agent layer for your FHIR EHR",
    short_name: "Last EHR",
    description:
      "The open-source agent layer for a headless FHIR EHR. It reads the chart broadly, will not report an absence it never checked for, and turns every write into a proposal a human approves.",
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
