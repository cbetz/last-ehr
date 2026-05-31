import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Last EHR — AI-Powered Electronic Health Record",
    short_name: "Last EHR",
    description:
      "AI-powered, low-code Electronic Health Record (EHR) platform for modern clinical teams.",
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
