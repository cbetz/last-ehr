import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Last EHR: FHIR agents need a safety case";
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
          padding: 64,
          background: "#101219",
          color: "#f5f2ea",
          border: "18px solid #101219",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #3a4050",
            paddingBottom: 22,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 38,
                height: 38,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#596ef5",
                color: "#ffffff",
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              +
            </div>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 700 }}>
              Last<span style={{ color: "#8ea0ff" }}>EHR</span>
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 16, color: "#aab3c8", letterSpacing: 1.5 }}>
            OPEN-SOURCE FHIR AGENT INFRASTRUCTURE
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 960 }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 700, lineHeight: 1, letterSpacing: -3 }}>
            FHIR agents need
          </div>
          <div style={{ display: "flex", marginTop: 8, fontSize: 72, fontWeight: 700, lineHeight: 1, letterSpacing: -3, color: "#8ea0ff" }}>
            a safety case.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid #3a4050",
            paddingTop: 22,
            color: "#c5ccdb",
            fontSize: 22,
          }}
        >
          <span>Structured proposals · explicit approval · backend policy</span>
          <span style={{ color: "#8ea0ff" }}>lastehr.com</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
