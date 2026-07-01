import { ImageResponse } from "next/og";

export const alt = "Last EHR: Open-source AI agent layer for Medplum and FHIR";
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
          alignItems: "flex-start",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #0b1120 0%, #1e293b 100%)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700 }}>
          Last EHR
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 36,
            marginTop: 20,
            color: "#94a3b8",
          }}
        >
          AI agents over the patient chart. Every write needs your approval.
        </div>
      </div>
    ),
    { ...size },
  );
}
