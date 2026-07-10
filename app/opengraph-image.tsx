import { ImageResponse } from "next/og";

export const alt = "Last EHR: approval-gated FHIR agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#081314",
          color: "#eaf8f4",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              background: "#9cf2d0",
              color: "#0b2823",
              fontSize: 23,
              fontWeight: 800,
            }}
          >
            +
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>
            Last<span style={{ color: "#9cf2d0" }}>EHR</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 980 }}>
          <div style={{ display: "flex", fontSize: 66, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2.5 }}>
            AI can work the chart.
          </div>
          <div style={{ display: "flex", marginTop: 8, fontSize: 66, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2.5, color: "#9cf2d0" }}>
            Not write it unattended.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, color: "#a1b9b2", fontSize: 24 }}>
          <span>Open source</span>
          <span style={{ color: "#9cf2d0" }}>•</span>
          <span>FHIR-native</span>
          <span style={{ color: "#9cf2d0" }}>•</span>
          <span>Approval-gated writes</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
