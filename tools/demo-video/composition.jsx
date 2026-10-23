import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const colors = {
  background: "#0c141c", pane: "#14212d", border: "#334757",
  foreground: "#f2f5f8", muted: "#afc1ce", accent: "#99e8d3",
};
const phases = {
  baseline: "Before approval",
  pending: "First proposal waiting",
  approved: "After approval",
  second_pending: "Second proposal waiting",
  canceled: "After cancellation",
};
const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function currentSegment(manifest, timeMs) {
  let startMs = 0;
  let proofPhase = "baseline";
  for (let index = 0; index < manifest.segments.length; index += 1) {
    const segment = manifest.segments[index];
    if (segment.proofPhase) proofPhase = segment.proofPhase;
    if (timeMs < startMs + segment.durationSeconds * 1000 || index === manifest.segments.length - 1) {
      return { segment, localMs: timeMs - startMs, proofPhase };
    }
    startMs += segment.durationSeconds * 1000;
  }
  throw new Error("No captured segment at this time.");
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: colors.muted, fontSize: 17, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 20, overflowWrap: "anywhere", lineHeight: 1.25 }}>{children}</div>
    </div>
  );
}

function ProofPane({ snapshot, source }) {
  const saved = snapshot.approvedObservation;
  const coding = saved?.code.coding.find(entry => entry.system === "http://loinc.org" && entry.code === "8867-4");
  const aiLabel = saved?.meta.security.find(entry => entry.system === "http://terminology.hl7.org/CodeSystem/v3-ObservationValue" && entry.code === "AIAST");
  const comparison = snapshot.comparedWith === "baseline" ? "baseline" : "the approved state";
  return (
    <aside style={{
      position: "absolute", left: 1340, top: 96, width: 548, height: 900,
      boxSizing: "border-box", background: colors.pane, border: `1px solid ${colors.border}`,
      borderRadius: 8, padding: "20px 22px", display: "flex", flexDirection: "column",
    }}>
      <div style={{ fontSize: 27, fontWeight: 700 }}>Last direct FHIR snapshot</div>
      <div style={{ color: colors.muted, fontSize: 17, marginTop: 6 }}>Actual paginated GET snapshot · local HAPI</div>
      <div style={{ color: colors.accent, fontSize: 22, marginTop: 18, fontWeight: 700 }}>{phases[snapshot.phase]}</div>
      <div style={{
        background: "#0a131b", borderRadius: 5, padding: 10, marginTop: 10,
        fontFamily: mono, fontSize: 14, lineHeight: 1.45, overflowWrap: "anywhere",
      }}>{snapshot.query}</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 16 }}>
        <span style={{ fontSize: 21 }}>Stored Observations</span>
        <strong style={{ fontSize: 44, fontVariantNumeric: "tabular-nums" }}>{snapshot.observationCount}</strong>
      </div>
      <div style={{ color: colors.muted, fontSize: 17, lineHeight: 1.4 }}>
        {snapshot.observationPageCount} page{snapshot.observationPageCount === 1 ? "" : "s"} followed · {snapshot.observationIds.length} distinct IDs
      </div>
      <div style={{ marginTop: 12, padding: "10px 0 14px", borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ color: colors.muted, fontSize: 18 }}>
          {snapshot.comparedWith ? `Change from ${comparison}` : "Baseline ID set captured"}
        </div>
        {snapshot.comparedWith && <div style={{ fontSize: 28, fontWeight: 700, marginTop: 5 }}>
          +{snapshot.addedIds.length} added / −{snapshot.removedIds.length} removed
        </div>}
        <div style={{ fontSize: 18, marginTop: 7, color: colors.accent }}>
          {snapshot.comparedWith ? "FHIR comparison passed" : "Baseline read passed"}
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        {saved ? <>
          <Field label="Stored Observation ID">{saved.id}</Field>
          <Field label="Patient reference">{saved.subject.reference}</Field>
          <div style={{ display: "flex", gap: 42 }}>
            <Field label="Value / unit">{saved.valueQuantity.value} {saved.valueQuantity.unit}</Field>
            <Field label="LOINC">{coding.code}</Field>
          </div>
          <Field label="AI security label">{aiLabel.code}</Field>
          <div style={{ color: colors.muted, fontFamily: mono, fontSize: 13, overflowWrap: "anywhere", lineHeight: 1.4 }}>{aiLabel.system}</div>
        </> : <div style={{ color: colors.muted, fontSize: 22, lineHeight: 1.5 }}>
          No approved Observation has been added in this snapshot.
          <div style={{ marginTop: 16, fontSize: 18 }}>The proposal in the app is separate from the stored record.</div>
        </div>}
      </div>
      <div style={{ marginTop: "auto", paddingTop: 12, borderTop: `1px solid ${colors.border}`, color: colors.muted, fontSize: 14, lineHeight: 1.5 }}>
        <div>Source <span style={{ fontFamily: mono }}>{source.commit.slice(0, 12)}</span> · MCP {source.packageVersion}</div>
        <div style={{ overflowWrap: "anywhere" }}>Proof: {source.reportUrl ?? "proof.json (companion report)"}</div>
        <div>lastehr.com/docs/quickstart</div>
      </div>
    </aside>
  );
}

export function Walkthrough({ manifest, proof }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!manifest || !proof) {
    return <AbsoluteFill style={{ backgroundColor: colors.background, color: colors.foreground, justifyContent: "center", alignItems: "center", fontFamily: "Arial, sans-serif", fontSize: 30 }}>
      Supply validated captured frames and an actual FHIR proof report using render.mjs.
    </AbsoluteFill>;
  }
  const { segment, localMs, proofPhase } = currentSegment(manifest, frame / fps * 1000);
  const selected = segment.frames.reduce((latest, candidate) => candidate.atMs <= localMs ? candidate : latest, segment.frames[0]);
  const snapshot = proof.snapshots[proofPhase];
  return (
    <AbsoluteFill style={{ backgroundColor: colors.background, color: colors.foreground, fontFamily: "Arial, Helvetica, sans-serif" }}>
      <header style={{ position: "absolute", left: 32, right: 32, top: 22, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 29, fontWeight: 700 }}>Synthetic local walkthrough <span style={{ color: colors.muted }}>• scripted • no external model call</span></div>
        <div style={{ color: colors.muted, fontSize: 18, textAlign: "right", lineHeight: 1.4 }}>Edited, sampled<br />screen recording · {manifest.fps} fps</div>
      </header>
      <div style={{ position: "absolute", left: 32, top: 96, width: 1280, height: 900, overflow: "hidden", borderRadius: 6, outline: `1px solid ${colors.border}` }}>
        <Img src={staticFile(selected.asset)} style={{ width: 1280, height: 900, objectFit: "contain" }} />
      </div>
      <ProofPane snapshot={snapshot} source={manifest.source} />
      <div style={{ position: "absolute", left: 32, right: 32, top: 1009, height: 62, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 29, fontWeight: 500, lineHeight: 1.22, textAlign: "center", whiteSpace: "pre-line" }}>
        {segment.caption}
      </div>
    </AbsoluteFill>
  );
}
