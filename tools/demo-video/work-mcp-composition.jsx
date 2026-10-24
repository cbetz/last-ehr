import React from "react";
import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const colors = { green: "#153f35", ink: "#173e35", cream: "#f5f4eb", white: "#ffffff", muted: "#5b7067", line: "#d9dfd5", lime: "#d9e7ab", amber: "#f0ddb1" };
const mono = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

function Pill({ children, warm = false }) {
  return <span style={{ display: "inline-flex", padding: "10px 16px", borderRadius: 6, background: warm ? colors.amber : colors.lime, color: colors.ink, fontSize: 22, fontWeight: 700, lineHeight: 1.25 }}>{children}</span>;
}

function Field({ label, children, code = false, small = false }) {
  return <div style={{ marginBottom: 23 }}>
    <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1.4, color: colors.muted, textTransform: "uppercase", marginBottom: 9 }}>{label}</div>
    <div style={{ fontFamily: code ? mono : "inherit", fontSize: small ? 21 : 27, lineHeight: 1.36, overflowWrap: "anywhere", whiteSpace: "pre-wrap", color: colors.ink }}>{children}</div>
  </div>;
}

function ReportHeader({ report, title }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${colors.line}`, paddingBottom: 22, marginBottom: 26 }}>
    <div><div style={{ fontSize: 17, letterSpacing: 1.5, fontWeight: 700, color: colors.muted, marginBottom: 7 }}>ACTUAL CLIENT REPORT · PROJECTED FIELDS</div><div style={{ fontSize: 31, fontWeight: 700 }}>{title}</div></div>
    <div style={{ textAlign: "right", fontSize: 21, color: colors.muted }}>{report.client}<br /><span style={{ fontFamily: mono, fontSize: 17 }}>{report.model}</span></div>
  </div>;
}

function ToolRow({ tools }) {
  return <Field label="Tools used">{tools.map((name) => <div key={name} style={{ fontFamily: mono, fontSize: 23, marginBottom: 7 }}>{name.replace("mcp__last-work__", "")}</div>)}</Field>;
}

function ProposalReport({ report }) {
  const job = report.job;
  return <div style={{ padding: "30px 34px" }}>
    <ReportHeader report={report} title="Read chart. Submit draft." />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
      <Field label="Work state"><Pill warm>{job.state}</Pill></Field>
      <Field label="Reviewed source" code small>{`${job.input.source.reference} · version ${job.input.source.versionId}`}</Field>
    </div>
    <ToolRow tools={report.toolsUsed} />
    <Field label="Draft submitted for review" small>{job.input.description}</Field>
    <div style={{ borderTop: `1px solid ${colors.line}`, paddingTop: 22 }}>
      <Field label="Durable work ID" code small>{report.workId}</Field>
      <div style={{ fontSize: 23, lineHeight: 1.4, color: colors.muted }}>{report.message}</div>
    </div>
  </div>;
}

function ResultReport({ report }) {
  return <div style={{ padding: "30px 34px" }}>
    <ReportHeader report={report} title="Reconnect. Retrieve the result." />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
      <Field label="Work state"><Pill>{report.job.state}</Pill></Field>
      <Field label="Verified FHIR receipt"><span style={{ fontSize: 39, fontWeight: 750 }}>{`Task/${report.job.receipt.id}`}</span><span style={{ fontSize: 23 }}>{` · version ${report.job.receipt.versionId}`}</span></Field>
    </div>
    <ToolRow tools={report.toolsUsed} />
    <Field label="Same durable work ID" code small>{report.workId}</Field>
    <Field label="Same reviewed proposal hash" code small>{report.job.proposalHash}</Field>
    <div style={{ background: "#eef2e6", borderLeft: `5px solid ${colors.green}`, padding: "23px 25px", fontSize: 27, lineHeight: 1.42 }}>{report.message}</div>
    <div style={{ marginTop: 25, display: "flex", justifyContent: "space-between", gap: 20 }}>
      <Pill>1 matching Task persisted</Pill>
      <span style={{ maxWidth: 505, color: colors.muted, fontSize: 19, lineHeight: 1.4 }}>Independent FHIR check during acceptance.<br />The assistant has no approval or save tool.</span>
    </div>
  </div>;
}

const scenes = [
  { title: "The assistant starts with a chart read.", body: "A real Claude Code client reads the bounded synthetic chart and proposes a follow-up Task through MCP.", callout: "A durable Work ID comes back. The proposal is waiting for review. FHIR has no Task from this request yet.", label: "01 / READ + PROPOSE", proof: "Native Claude Code · two MCP tools" },
  { title: "Last owns the review decision.", body: "The separate reviewer inbox shows the exact draft, source version, proposal hash, and persistence receipt.", callout: "This acceptance run used an automated test reviewer. The assistant never received reviewer credentials.", label: "02 / SEPARATE REVIEW", proof: "Actual inbox capture · cropped for legibility" },
  { title: "A fresh assistant gets the verified result.", body: "A new Claude Code process reconnects with the saved Work ID. One status tool retrieves the reviewed outcome.", callout: "The same draft. The same Work ID. A verified FHIR Task. Patient contact has not been performed.", label: "03 / RECONNECT + VERIFY", proof: "Fresh native Claude Code · get_work only" },
];

function Scene({ index, evidence }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scene = scenes[index];
  const opacity = interpolate(frame, [0, 0.4 * fps], [0.55, 1], { extrapolateRight: "clamp" });
  const progress = interpolate(frame, [0, 20 * fps - 1], [0, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ background: colors.cream, color: colors.ink, fontFamily: 'Arial, "Helvetica Neue", sans-serif' }}>
    <div style={{ height: 114, padding: "0 64px", background: colors.green, color: colors.cream, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ fontWeight: 750, fontSize: 43, letterSpacing: -2 }}>Last<span style={{ fontWeight: 400, letterSpacing: 0, marginLeft: 25, fontSize: 25, color: "#d6e2d6" }}>Assistants that can propose work.</span></div>
      <div style={{ fontSize: 22, color: "#e2eadc" }}>lastehr.com</div>
    </div>
    <div style={{ position: "absolute", top: 145, bottom: 121, left: 64, right: 64, display: "grid", gridTemplateColumns: "520px 1fr", gap: 54, opacity }}>
      <div style={{ display: "flex", flexDirection: "column", paddingTop: 17 }}>
        <div style={{ fontSize: 19, fontWeight: 750, letterSpacing: 2.2, marginBottom: 29, color: colors.muted }}>{scene.label}</div>
        <h1 style={{ fontSize: 62, lineHeight: 1.08, letterSpacing: -2.3, margin: "0 0 29px", fontWeight: 750 }}>{scene.title}</h1>
        <p style={{ fontSize: 28, lineHeight: 1.42, margin: "0 0 31px", color: colors.muted }}>{scene.body}</p>
        <div style={{ borderTop: `2px solid ${colors.ink}`, paddingTop: 23, fontSize: 25, lineHeight: 1.42 }}>{scene.callout}</div>
        <div style={{ marginTop: "auto", color: colors.muted, fontSize: 19, lineHeight: 1.4 }}>{scene.proof}</div>
      </div>
      <div style={{ border: `1px solid ${colors.line}`, borderRadius: 13, background: colors.white, overflow: "hidden", boxShadow: "0 8px 26px rgba(16,43,34,0.05)" }}>
        {index === 0 ? <ProposalReport report={evidence.proposal} /> : index === 2 ? <ResultReport report={evidence.result} /> : <div style={{ padding: "25px 27px" }}>
          <div style={{ fontSize: 17, letterSpacing: 1.4, color: colors.muted, fontWeight: 700, marginBottom: 17 }}>ACTUAL LAST REVIEWER INBOX · APPROVED TEST RUN</div>
          <div style={{ height: 748, width: "100%", position: "relative", overflow: "hidden", borderRadius: 7 }}>
            <Img src={staticFile(evidence.screenshotAsset)} style={{ position: "absolute", width: 1110, maxWidth: "none", top: -220, left: 0 }} />
          </div>
        </div>}
      </div>
    </div>
    <div style={{ position: "absolute", bottom: 0, height: 99, left: 0, right: 0, borderTop: `1px solid ${colors.line}`, padding: "23px 64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ fontSize: 19, lineHeight: 1.45, color: colors.muted }}>Recorded evidence walkthrough · synthetic data · automated test reviewer<br />Edited reports and an actual inbox capture; this is not a continuous screen recording.</div>
      <div style={{ width: 400 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, marginBottom: 12 }}><span>Read + propose</span><span>Review</span><span>Retrieve</span></div><div style={{ height: 5, background: colors.line }}><div style={{ width: `${((index + progress) / 3) * 100}%`, height: 5, background: colors.green }} /></div></div>
    </div>
  </AbsoluteFill>;
}

export function WorkMcpWalkthrough({ evidence }) {
  const { fps } = useVideoConfig();
  if (!evidence) return <AbsoluteFill style={{ background: colors.cream }} />;
  return <AbsoluteFill>{scenes.map((scene, index) => <Sequence key={scene.label} from={index * 20 * fps} durationInFrames={20 * fps} premountFor={fps}><Scene index={index} evidence={evidence} /></Sequence>)}</AbsoluteFill>;
}
