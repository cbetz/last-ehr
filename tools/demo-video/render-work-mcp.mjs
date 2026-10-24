import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(toolDirectory, "../..");
const artifactDirectory = path.join(repositoryRoot, "artifacts/work-lab");
const inputFiles = ["claude-code-proposal.json", "claude-code-result.json", "claude-code-fhir-proof.json", "claude-code-reviewed.png"];
const digest = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const id = /^[A-Za-z0-9.-]{1,64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const timestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
class EvidenceError extends Error {}
const requireEvidence = (condition, message) => { if (!condition) throw new EvidenceError(message); };
const keysExactly = (value, required, optional = []) => value && typeof value === "object" && !Array.isArray(value) && required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => [...required, ...optional].includes(key));

function screenshotDimensions(bytes) {
  if (bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString("ascii", 12, 16) === "IHDR") return { format: "png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let cursor = 2;
  while (cursor + 3 < bytes.length) {
    if (bytes[cursor] !== 0xff) return undefined;
    while (bytes[cursor] === 0xff) cursor++;
    const marker = bytes[cursor++];
    if (marker === 0xda || marker === 0xd9) return undefined;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (cursor + 2 > bytes.length) return undefined;
    const length = bytes.readUInt16BE(cursor);
    if (length < 2 || cursor + length > bytes.length) return undefined;
    if (frames.has(marker)) return length >= 8 ? { format: "jpeg", width: bytes.readUInt16BE(cursor + 5), height: bytes.readUInt16BE(cursor + 3) } : undefined;
    cursor += length;
  }
  return undefined;
}

/** Validate recorded native-client reports without inventing missing execution data. */
export function validateWorkMcpEvidence(proposal, result, screenshot, proof) {
  for (const report of [proposal, result]) {
    requireEvidence(keysExactly(report, ["client", "model", "mode", "toolsUsed", "workId", "job", "message"]), "Native client report fields are missing or unexpected.");
    requireEvidence(report.client === "Claude Code" && report.model === "claude-sonnet-4-6" && uuid.test(report.workId), "Expected native Claude Code report and durable Work ID.");
    requireEvidence(typeof report.message === "string" && report.message.length > 0 && report.message.length < 1000, "An authoritative client result message is required.");
    requireEvidence(keysExactly(report.job, ["id", "tenantId", "requestedBy", "reviewerSubject", "state", "createdAt", "updatedAt", "expiresAt", "input", "proposal", "proposalHash"], ["decision", "receipt"]), "The durable job fields are missing or unexpected.");
    const job = report.job;
    requireEvidence(job.id === report.workId && job.tenantId === "synthetic-work-lab" && job.requestedBy === "assistant-lab" && job.reviewerSubject === "reviewer-lab", "The native report does not identify the bounded synthetic roles and work item.");
    requireEvidence([job.createdAt, job.updatedAt, job.expiresAt].every(timestamp), "Work timestamps must be recorded.");
    requireEvidence(keysExactly(job.input, ["patientId", "source", "description", "dueDate"]) && id.test(job.input.patientId) && keysExactly(job.input.source, ["reference", "versionId"]) && /^Observation\/[A-Za-z0-9.-]{1,64}$/.test(job.input.source.reference) && id.test(job.input.source.versionId), "The recorded source citation is invalid.");
    requireEvidence(typeof job.input.description === "string" && job.input.description.length > 0 && job.input.description.length <= 2000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(job.input.description) && /^\d{4}-\d{2}-\d{2}$/.test(job.input.dueDate), "The recorded draft is not a bounded follow-up proposal.");
    const expected = {
      resourceType: "Task", identifier: [{ system: "https://lastehr.com/work-lab/job", value: job.id }],
      status: "requested", intent: "order", for: { reference: `Patient/${job.input.patientId}` },
      focus: { reference: job.input.source.reference }, input: [{ type: { text: "Reviewed source version" }, valueString: `${job.input.source.reference}/_history/${job.input.source.versionId}` }],
      description: job.input.description, restriction: { period: { end: job.input.dueDate } },
    };
    requireEvidence(canonical(job.proposal) === canonical(expected) && digest(canonical(job.proposal)) === job.proposalHash, "The exact draft, reviewed source version, or proposal hash does not match.");
  }
  requireEvidence(proposal.mode === "propose" && proposal.job.state === "awaiting_review" && !proposal.job.decision && !proposal.job.receipt, "The first native report must stop before reviewer approval or FHIR persistence.");
  requireEvidence(JSON.stringify(proposal.toolsUsed) === JSON.stringify(["mcp__last-work__read_work_context", "mcp__last-work__propose_work"]), "The first native client must use only bounded chart read and proposal tools.");
  requireEvidence(result.mode === "status" && result.job.state === "succeeded" && JSON.stringify(result.toolsUsed) === JSON.stringify(["mcp__last-work__get_work"]), "The fresh client report must retrieve status using get_work only.");
  requireEvidence(proposal.workId === result.workId && proposal.job.proposalHash === result.job.proposalHash && canonical(proposal.job.input) === canonical(result.job.input) && canonical(proposal.job.proposal) === canonical(result.job.proposal), "The reconnect report must describe the exact same work item and draft.");
  const decision = result.job.decision;
  const receipt = result.job.receipt;
  requireEvidence(keysExactly(decision, ["decision", "subject", "at", "proposalHash"]) && decision.decision === "approve" && decision.subject === result.job.reviewerSubject && decision.proposalHash === result.job.proposalHash && timestamp(decision.at), "A matching separate-reviewer approval is required.");
  requireEvidence(keysExactly(receipt, ["resourceType", "id", "versionId", "verifiedAt"]) && receipt.resourceType === "Task" && id.test(receipt.id) && id.test(receipt.versionId) && timestamp(receipt.verifiedAt) && Date.parse(receipt.verifiedAt) >= Date.parse(decision.at), "A verified Task receipt after approval is required.");
  requireEvidence(result.message.includes(`independently verified Task/${receipt.id}`) && proposal.message.includes("No FHIR Task has been saved"), "The reports must contain the authoritative pending and verified outcome messages.");
  requireEvidence(keysExactly(proof, ["workId", "proposalHash", "beforeApproval", "afterApproval", "scope"]) && proof.workId === result.workId && proof.proposalHash === result.job.proposalHash, "An independent FHIR proof for the exact work item is required.");
  requireEvidence(keysExactly(proof.beforeApproval, ["matchingTaskCount", "observation"]) && proof.beforeApproval.matchingTaskCount === 0 && typeof proof.beforeApproval.observation === "string" && proof.beforeApproval.observation.includes("timestamp was not retained"), "The pre-approval assertion must preserve its explicitly unretained timestamp limitation.");
  const after = proof.afterApproval;
  requireEvidence(keysExactly(after, ["verifiedAt", "query", "matchingTaskCount", "resourceType", "id", "versionId", "exactApprovedFieldsMatch"]) && timestamp(after.verifiedAt) && Date.parse(after.verifiedAt) >= Date.parse(receipt.verifiedAt) && after.matchingTaskCount === 1 && after.resourceType === "Task" && after.id === receipt.id && after.versionId === receipt.versionId && after.exactApprovedFieldsMatch === true, "The independent FHIR proof must verify one exact Task matching the receipt.");
  requireEvidence(typeof after.query === "string" && after.query.startsWith("GET /fhir/Task?"), "The independent FHIR GET query is missing.");
  const query = new URL(after.query.slice(4), "http://127.0.0.1:8080");
  requireEvidence(query.pathname === "/fhir/Task" && query.searchParams.get("identifier") === `https://lastehr.com/work-lab/job|${result.workId}` && query.searchParams.get("_count") === "2" && query.searchParams.get("_total") === "accurate" && [...query.searchParams].length === 3, "The independent FHIR search must be scoped to this exact Work ID and accurate totals.");
  const dimensions = screenshotDimensions(screenshot);
  requireEvidence(dimensions?.width === 955 && dimensions.height === 920, "The reviewed PNG/JPEG screenshot dimensions changed; inspect and adjust the explicit crop before rendering.");
  return { workId: result.workId, proposalHash: result.job.proposalHash, receipt, screenshot: dimensions, independentPersistenceCheck: proof };
}

async function main() {
  const args = process.argv.slice(2);
  requireEvidence(args.length === 0 || (args.length === 1 && ["--check", "--help"].includes(args[0])), "Use render-work-mcp.mjs [--check|--help].");
  if (args[0] === "--help") {
    console.log("node tools/demo-video/render-work-mcp.mjs [--check]");
    console.log("Reads the two recorded Claude Code reports, independent FHIR proof, and reviewer screenshot from artifacts/work-lab. Writes an edited 60-second evidence walkthrough there, never into public/.");
    return;
  }
  let work;
  let stage = "recorded evidence validation";
  const priorCwd = process.cwd();
  try {
    const bytes = await Promise.all(inputFiles.map((filename) => readFile(path.join(artifactDirectory, filename))));
    const proposal = JSON.parse(bytes[0]);
    const result = JSON.parse(bytes[1]);
    const proof = JSON.parse(bytes[2]);
    const validated = validateWorkMcpEvidence(proposal, result, bytes[3], proof);
    if (args[0] === "--check") { console.log("Validated matching native read/propose and reconnect reports, exact draft hash, separate approval, Task receipt, and actual reviewer screenshot."); return; }
    await mkdir(artifactDirectory, { recursive: true });
    work = await mkdtemp(path.join(artifactDirectory, ".work-mcp-render-"));
    const publicDirectory = path.join(work, "public");
    const candidate = path.join(work, "candidate");
    await mkdir(publicDirectory); await mkdir(candidate);
    const screenshotAsset = `reviewer-${digest(bytes[3]).slice(0, 12)}.${validated.screenshot.format === "jpeg" ? "jpg" : "png"}`;
    await copyFile(path.join(artifactDirectory, inputFiles[3]), path.join(publicDirectory, screenshotAsset));
    requireEvidence(digest(await readFile(path.join(publicDirectory, screenshotAsset))) === digest(bytes[3]), "The reviewer screenshot changed after validation.");
    const inputProps = { evidence: { proposal, result, screenshotAsset } };
    process.chdir(toolDirectory);
    const { bundle } = await import("@remotion/bundler");
    const { getVideoMetadata, renderMedia, renderStill, selectComposition } = await import("@remotion/renderer");
    stage = "evidence composition bundling";
    const serveUrl = await bundle({ entryPoint: path.join(toolDirectory, "work-mcp-entry.jsx"), rootDir: toolDirectory, publicDir: publicDirectory, outDir: path.join(work, "bundle"), enableCaching: false });
    const composition = await selectComposition({ serveUrl, id: "WorkMcpEvidence", inputProps, logLevel: "error" });
    assert.equal(composition.width, 1920); assert.equal(composition.height, 1080); assert.equal(composition.fps, 5); assert.equal(composition.durationInFrames, 300);
    stage = "representative frame rendering";
    const outputs = ["work-mcp-walkthrough.mp4", "work-mcp-poster.png", "work-mcp-scene-1.png", "work-mcp-scene-2.png", "work-mcp-scene-3.png"];
    for (const [index, frame] of [50, 150, 250].entries()) await renderStill({ serveUrl, composition, inputProps, frame, output: path.join(candidate, `work-mcp-scene-${index + 1}.png`), imageFormat: "png", logLevel: "error" });
    await copyFile(path.join(candidate, "work-mcp-scene-3.png"), path.join(candidate, "work-mcp-poster.png"));
    stage = "60-second evidence video rendering";
    await renderMedia({ serveUrl, composition, inputProps, codec: "h264", pixelFormat: "yuv420p", outputLocation: path.join(candidate, outputs[0]), videoBitrate: "1800k", x264Preset: "medium", imageFormat: "png", concurrency: 2, muted: true, logLevel: "error" });
    stage = "encoded media metadata verification";
    const mediaMetadata = await getVideoMetadata(path.join(candidate, outputs[0]), { logLevel: "error" });
    requireEvidence(mediaMetadata.width === 1920 && mediaMetadata.height === 1080 && mediaMetadata.fps === 5 && mediaMetadata.durationInSeconds === 60 && mediaMetadata.codec === "h264" && mediaMetadata.pixelFormat === "yuv420p" && mediaMetadata.audioCodec === null, "The encoded media does not match the required 60-second silent H.264 composition.");
    const outputHashes = await Promise.all(outputs.map(async (filename) => { const content = await readFile(path.join(candidate, filename)); return { file: filename, bytes: content.length, sha256: digest(content) }; }));
    requireEvidence(outputHashes[0].bytes > 0 && outputHashes[0].bytes < 20_000_000, "The rendered walkthrough is empty or exceeds the 20 MB size budget.");
    const sourceFiles = ["work-mcp-entry.jsx", "work-mcp-composition.jsx", "render-work-mcp.mjs"];
    const sources = await Promise.all(sourceFiles.map(async (filename) => ({ file: `tools/demo-video/${filename}`, sha256: digest(await readFile(path.join(toolDirectory, filename))) })));
    const report = {
      schemaVersion: 1, width: 1920, height: 1080, fps: 5, durationSeconds: 60, frames: 300,
      type: "recorded-evidence-walkthrough", syntheticOnly: true, edited: true, continuousScreenRecording: false,
      nativeClient: "Claude Code", realProviderCall: true, reviewer: "automated test reviewer", noPatientContact: true,
      ...validated, inputs: inputFiles.map((file, index) => ({ file: `artifacts/work-lab/${file}`, bytes: bytes[index].length, sha256: digest(bytes[index]) })),
      verificationScope: "Renderer validates and hashes recorded reports, proof, and screenshot. It does not query FHIR or rerun the assistant. The before-approval proof explicitly lacks its original snapshot timestamp.",
      sources, outputs: outputHashes, mediaMetadata, representativeFrames: [50, 150, 250], screenshotCrop: { imageWidth: 1110, imageTop: -220, viewportHeight: 748 },
    };
    await writeFile(path.join(candidate, "work-mcp-render-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    stage = "validated artifact promotion";
    // Invalidate any earlier success report before promoting this complete set.
    await rm(path.join(artifactDirectory, "work-mcp-render-report.json"), { force: true });
    for (const filename of [...outputs, "work-mcp-render-report.json"]) await rename(path.join(candidate, filename), path.join(artifactDirectory, filename));
    console.log(`Rendered 60-second Work MCP evidence walkthrough: 1920×1080, 5 fps, 300 frames, ${(outputHashes[0].bytes / 1_000_000).toFixed(2)} MB. Poster, three representative frames, and input/output hashes are in artifacts/work-lab.`);
  } catch (error) {
    if (error instanceof EvidenceError) throw error;
    throw new EvidenceError(`Work MCP walkthrough failed during ${stage}; raw diagnostics were withheld.`);
  } finally {
    process.chdir(priorCwd);
    if (work) await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) void main().catch((error) => {
  console.error(error instanceof EvidenceError ? error.message : "Work MCP renderer failed; raw diagnostics were withheld.");
  process.exitCode = 1;
});
