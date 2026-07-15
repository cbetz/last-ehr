import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Last EHR: Human-approved AI writeback for FHIR";
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
            {/* The last-chevron brand mark (see components/brand-mark.tsx). */}
            <svg
              width="38"
              height="38"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#596ef5"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m7 18 6-6-6-6" />
              <path d="M17 6v12" />
            </svg>
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
            Human-approved AI writeback
          </div>
          <div style={{ display: "flex", marginTop: 8, fontSize: 72, fontWeight: 700, lineHeight: 1, letterSpacing: -3, color: "#8ea0ff" }}>
            for FHIR
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
