import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(toolDirectory, "../..");
const PHASES = ["baseline", "pending", "approved", "second_pending", "canceled"];
const ID = /^[A-Za-z0-9.-]{1,64}$/;
const HASH = /^[a-f0-9]{40}$/;
const MAX_VIDEO_BYTES = 15_000_000;
const object = value => value && typeof value === "object" && !Array.isArray(value);
class InputError extends Error {}
const requireInput = (condition, message) => { if (!condition) throw new InputError(message); };
const sameIds = (left, right) => [...left].sort().join("\n") === [...right].sort().join("\n");
const difference = (left, right) => left.filter(value => !right.includes(value));
const hash = value => createHash("sha256").update(value).digest("hex");

function identifierList(value) {
  return Array.isArray(value) && value.every(id => typeof id === "string" && ID.test(id)) && new Set(value).size === value.length;
}

function imageDimensions(bytes) {
  if (bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString("ascii", 12, 16) === "IHDR") {
    return { format: "png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let cursor = 2;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (cursor + 3 < bytes.length) {
    if (bytes[cursor] !== 0xff) return undefined;
    while (bytes[cursor] === 0xff) cursor += 1;
    const marker = bytes[cursor++];
    if (marker === 0xda || marker === 0xd9) return undefined;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (cursor + 2 > bytes.length) return undefined;
    const length = bytes.readUInt16BE(cursor);
    if (length < 2 || cursor + length > bytes.length) return undefined;
    if (startOfFrame.has(marker)) {
      if (length < 8) return undefined;
      return { format: "jpeg", width: bytes.readUInt16BE(cursor + 5), height: bytes.readUInt16BE(cursor + 3) };
    }
    cursor += length;
  }
  return undefined;
}

/** Validates evidence, without filling missing data or creating a synthetic UI. */
export async function validateInputs(manifest, proof) {
  requireInput(object(manifest) && manifest.schemaVersion === 1, "Capture manifest schemaVersion must be 1.");
  requireInput(manifest.width === 1280 && manifest.height === 900 && manifest.fps === 5, "Capture manifest must describe 1280×900 frames at 5 fps.");
  requireInput(object(manifest.source) && HASH.test(manifest.source.commit ?? "") && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.source.packageVersion ?? ""), "Capture source commit and packageVersion are required.");
  if (manifest.source.reportUrl !== undefined) {
    let url;
    try { url = new URL(manifest.source.reportUrl); } catch { /* rejected below */ }
    requireInput(url?.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash, "Optional reportUrl must be HTTPS without URL credentials, query or fragment.");
  }
  requireInput(Array.isArray(manifest.segments) && manifest.segments.length > 0, "Capture manifest needs actual captured segments.");
  const files = new Map();
  const seenIds = new Set();
  const representedPhases = [];
  let duration = 0;
  for (const segment of manifest.segments) {
    requireInput(object(segment) && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(segment.id ?? "") && !seenIds.has(segment.id), "Every capture segment needs a distinct safe id.");
    seenIds.add(segment.id);
    requireInput(Number.isFinite(segment.durationSeconds) && segment.durationSeconds > 0 && Number.isInteger(segment.durationSeconds * manifest.fps), "Segment durations must be positive and land on frame boundaries.");
    duration += segment.durationSeconds;
    requireInput(typeof segment.caption === "string" && segment.caption.trim().length > 0 && segment.caption.length <= 240 && segment.caption.split("\n").length <= 2, "Every segment needs a readable caption of at most 240 characters and two lines.");
    requireInput(Array.isArray(segment.frames) && segment.frames.length > 0, "Every segment must contain actual captured image frames.");
    let lastMs = -1;
    for (const [index, frame] of segment.frames.entries()) {
      requireInput(object(frame) && typeof frame.path === "string" && path.isAbsolute(frame.path) && [".png", ".jpg", ".jpeg"].includes(path.extname(frame.path).toLowerCase()), "Frame paths must identify absolute local PNG or JPEG files.");
      requireInput(Number.isFinite(frame.atMs) && frame.atMs >= 0 && frame.atMs > lastMs && frame.atMs < segment.durationSeconds * 1000 && (index !== 0 || frame.atMs === 0), "Frame times must start at zero and increase within the segment.");
      lastMs = frame.atMs;
      if (!files.has(frame.path)) {
        const info = await stat(frame.path).catch(() => undefined);
        requireInput(info?.isFile() && info.size > 24 && info.size <= 20 * 1024 * 1024, "A captured image is missing or outside the image size limit.");
        const bytes = await readFile(frame.path);
        const dimensions = imageDimensions(bytes);
        requireInput(dimensions?.width === 1280 && dimensions.height === 900, "Captured PNG/JPEG pixels must actually be 1280×900.");
        files.set(frame.path, { sha256: hash(bytes), size: info.size, format: dimensions.format });
      }
    }
    if (segment.proofPhase !== undefined) {
      requireInput(PHASES.includes(segment.proofPhase), "Segment proofPhase is unknown.");
      if (representedPhases.at(-1) !== segment.proofPhase) representedPhases.push(segment.proofPhase);
    }
  }
  requireInput(Math.abs(duration - 90) < 0.000001, "The edited walkthrough must total exactly 90 seconds.");
  requireInput(sameIds(representedPhases, PHASES) && representedPhases.join() === PHASES.join(), "Segments must present all five proof phases in order.");

  requireInput(object(proof) && proof.schemaVersion === 1 && proof.status === "passed", "An actual, completed passing proof report is required.");
  requireInput(proof.source?.commit === manifest.source.commit, "Capture and proof source commits must match.");
  const provenance = proof.source.provenance;
  requireInput(object(provenance) && provenance.head === proof.source.commit && provenance.trackedClean === true && provenance.untrackedClean === true && Number.isFinite(Date.parse(provenance.verifiedAt)), "Proof must record verified clean source provenance for the captured commit.");
  requireInput(object(proof.syntheticPatient) && ID.test(proof.syntheticPatient.id ?? "") && proof.syntheticPatient.identifierSystem === "https://lastehr.com/synthetic" && proof.syntheticPatient.identifierValue === "synthetic-004", "Proof must identify the supplied synthetic-004 patient.");
  let base;
  try { base = new URL(proof.fhirBaseUrl); } catch { /* rejected below */ }
  requireInput(base?.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) && /\/fhir\/?$/.test(base.pathname) && !base.username && !base.password && !base.search && !base.hash, "Proof FHIR endpoint must be the local loopback synthetic stack.");
  requireInput(object(proof.snapshots), "Proof snapshots are missing.");
  for (const phase of PHASES) {
    const snapshot = proof.snapshots[phase];
    requireInput(object(snapshot) && snapshot.phase === phase && snapshot.status === "pass" && Number.isFinite(Date.parse(snapshot.capturedAt)), "Every proof phase needs its actual passing timestamped snapshot.");
    requireInput(Number.isFinite(Date.parse(snapshot.sourceVerifiedAt)) && Date.parse(snapshot.sourceVerifiedAt) >= Date.parse(snapshot.capturedAt), "Every proof snapshot needs its completed source verification timestamp.");
    requireInput(typeof snapshot.query === "string" && snapshot.query.startsWith("GET /fhir/Observation?"), "Proof must include the independent FHIR GET query.");
    const query = new URL(snapshot.query.slice(4), base);
    requireInput(query.pathname === "/fhir/Observation" && query.searchParams.get("patient") === proof.syntheticPatient.id && query.searchParams.get("_count") === "1" && query.searchParams.get("_total") === "accurate" && [...query.searchParams].length === 3, "Proof GET must scope the supplied synthetic patient and request paginated accurate totals.");
    requireInput(Number.isInteger(snapshot.patientPageCount) && snapshot.patientPageCount > 0 && Number.isInteger(snapshot.observationPageCount) && snapshot.observationPageCount > 0, "Proof must record positive actual pagination counts.");
    requireInput(identifierList(snapshot.observationIds) && snapshot.observationCount === snapshot.observationIds.length && identifierList(snapshot.addedIds) && identifierList(snapshot.removedIds), "Proof counts and resource ID sets must agree.");
    requireInput(snapshot.patientExactTotal === 1 && snapshot.observationExactTotal === snapshot.observationCount, "Proof exact totals must agree with the fully traversed resource sets.");
    const comparison = phase === "baseline" ? null : ["pending", "approved"].includes(phase) ? "baseline" : "approved";
    requireInput(snapshot.comparedWith === comparison, "Proof comparison phase does not match the workflow.");
    const previous = comparison ? proof.snapshots[comparison]?.observationIds : snapshot.observationIds;
    requireInput(identifierList(previous) && sameIds(snapshot.addedIds, difference(snapshot.observationIds, previous)) && sameIds(snapshot.removedIds, difference(previous, snapshot.observationIds)), "Proof ID deltas do not match the actual snapshot sets.");
    requireInput(snapshot.removedIds.length === 0 && snapshot.addedIds.length === (phase === "approved" ? 1 : 0), "Only the approved phase may add exactly one Observation.");
    const saved = snapshot.approvedObservation;
    if (phase === "baseline" || phase === "pending") {
      requireInput(saved === null, "Pre-approval snapshots must not claim a saved Observation.");
      continue;
    }
    const createdId = proof.snapshots.approved.addedIds[0];
    requireInput(object(saved) && saved.resourceType === "Observation" && saved.id === createdId && snapshot.observationIds.includes(saved.id) && saved.status === "final" && saved.subject?.reference === `Patient/${proof.syntheticPatient.id}`, "Saved Observation identity or patient association failed validation.");
    requireInput(saved.valueQuantity?.value === 72 && saved.valueQuantity.unit === "bpm" && saved.valueQuantity.system === "http://unitsofmeasure.org" && saved.valueQuantity.code === "/min", "Stored Observation must contain the reviewed synthetic value and UCUM unit.");
    requireInput(Array.isArray(saved.code?.coding) && saved.code.coding.some(entry => entry.system === "http://loinc.org" && entry.code === "8867-4"), "Stored Observation must contain the reviewed LOINC code.");
    requireInput(Array.isArray(saved.meta?.security) && saved.meta.security.some(entry => entry.system === "http://terminology.hl7.org/CodeSystem/v3-ObservationValue" && entry.code === "AIAST"), "Stored Observation must carry the actual AIAST security label.");
  }
  return { durationSeconds: duration, frameCount: 90 * manifest.fps, capturedFiles: files };
}

function timestamp(seconds) {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const secs = Math.floor(milliseconds / 1000) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(milliseconds % 1000).padStart(3, "0")}`;
}

export function webVtt(manifest) {
  let start = 0;
  const cues = manifest.segments.map((segment, index) => {
    const end = start + segment.durationSeconds;
    const caption = segment.caption.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const cue = `${index + 1}\n${timestamp(start)} --> ${timestamp(end)}\n${caption}\n`;
    start = end;
    return cue;
  });
  return `WEBVTT\n\nNOTE Edited, sampled synthetic screen recording; scripted; no external model call.\nNOTE Source ${manifest.source.commit}; MCP ${manifest.source.packageVersion}.\n\n${cues.join("\n")}`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("node render.mjs --manifest /absolute/capture.json --proof /absolute/proof.json [--out-dir artifacts/demo-video] [--check|--prepare-studio|--still-only] [--poster-frame 150] [--browser /absolute/chrome]");
    console.log("Requires real 1280×900 PNG/JPEG captures, all five passing FHIR proof snapshots, and exactly 90 seconds. Frame atMs values are relative to their segment, starting at zero. No missing data is invented.");
    return;
  }
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    requireInput(["--manifest", "--proof", "--out-dir", "--poster-frame", "--browser", "--check", "--still-only", "--prepare-studio"].includes(flag) && options[flag] === undefined, "Unknown or repeated renderer argument.");
    if (["--check", "--still-only", "--prepare-studio"].includes(flag)) options[flag] = true;
    else {
      requireInput(args[index + 1] && !args[index + 1].startsWith("--"), "A renderer argument is missing its value.");
      options[flag] = args[++index];
    }
  }
  requireInput(options["--manifest"] && options["--proof"], "Supply --manifest and --proof from the real captured walkthrough.");
  requireInput(["--check", "--still-only", "--prepare-studio"].filter(flag => options[flag]).length <= 1, "Choose only one of --check, --still-only or --prepare-studio.");
  let stage = "input validation";
  let work;
  let keepStudioAssets = false;
  const invocationDirectory = process.cwd();
  try {
    const manifestBytes = await readFile(path.resolve(options["--manifest"]));
    const proofBytes = await readFile(path.resolve(options["--proof"]));
    const manifest = JSON.parse(manifestBytes);
    const proof = JSON.parse(proofBytes);
    const validated = await validateInputs(manifest, proof);
    if (options["--check"]) {
      console.log(`Validated actual evidence: ${manifest.segments.length} segments, ${validated.capturedFiles.size} native image files, ${validated.frameCount} output frames, 90 seconds, five FHIR comparisons.`);
      return;
    }
    const output = path.resolve(options["--out-dir"] ?? path.join(repositoryRoot, "artifacts/demo-video"));
    const artifacts = path.join(repositoryRoot, "artifacts");
    requireInput(output.startsWith(artifacts + path.sep), "Rendered outputs must remain inside this repository's ignored artifacts directory until QA.");
    await mkdir(output, { recursive: true });
    work = await mkdtemp(path.join(output, options["--prepare-studio"] ? "studio-" : ".render-"));
    const publicDirectory = path.join(work, "public");
    await mkdir(publicDirectory);
    const assetPaths = new Map();
    for (const [index, [filename, info]] of [...validated.capturedFiles].entries()) {
      const asset = `capture-${String(index).padStart(5, "0")}-${info.sha256.slice(0, 12)}.${info.format === "png" ? "png" : "jpg"}`;
      await copyFile(filename, path.join(publicDirectory, asset));
      requireInput(hash(await readFile(path.join(publicDirectory, asset))) === info.sha256, "A captured frame changed after validation; capture must finish before rendering.");
      assetPaths.set(filename, asset);
    }
    const prepared = { ...manifest, segments: manifest.segments.map(segment => ({ ...segment, frames: segment.frames.map(frame => ({ ...frame, asset: assetPaths.get(frame.path) })) })) };
    const inputProps = { manifest: prepared, proof };
    if (options["--prepare-studio"]) {
      const propsFile = path.join(work, "props.json");
      await writeFile(propsFile, JSON.stringify(inputProps, null, 2) + "\n");
      keepStudioAssets = true;
      const quote = value => `'${value.replaceAll("'", `'"'"'`)}'`;
      console.log("Validated actual captures are prepared for the standalone Remotion Studio:");
      console.log(`npm --prefix ${quote(toolDirectory)} run studio -- --public-dir ${quote(publicDirectory)} --props ${quote(propsFile)}`);
      return;
    }
    const browserOptions = options["--browser"] ? { browserExecutable: path.resolve(options["--browser"]) } : {};
    // Keep any browser/cache download inside this standalone tool's own
    // node_modules, rather than the repository's application dependencies.
    process.chdir(toolDirectory);
    const { bundle } = await import("@remotion/bundler");
    const { renderMedia, renderStill, selectComposition } = await import("@remotion/renderer");
    stage = "bundling captured frames";
    const serveUrl = await bundle({ entryPoint: path.join(toolDirectory, "entry.jsx"), rootDir: toolDirectory, publicDir: publicDirectory, outDir: path.join(work, "bundle"), enableCaching: false });
    const composition = await selectComposition({ serveUrl, id: "SyntheticWalkthrough", inputProps, ...browserOptions, logLevel: "error" });
    assert.equal(composition.width, 1920);
    assert.equal(composition.height, 1080);
    assert.equal(composition.durationInFrames / composition.fps, 90);
    let approvedStart = 0;
    for (const segment of manifest.segments) {
      if (segment.proofPhase === "approved") break;
      approvedStart += segment.durationSeconds;
    }
    const posterFrame = options["--poster-frame"] === undefined ? Math.min(Math.round((approvedStart + 1) * manifest.fps), validated.frameCount - 1) : Number(options["--poster-frame"]);
    requireInput(Number.isInteger(posterFrame) && posterFrame >= 0 && posterFrame < validated.frameCount, "Poster frame must be within the actual 90-second composition.");
    const candidate = path.join(work, "candidate");
    await mkdir(candidate);
    stage = "poster rendering";
    await renderStill({ serveUrl, composition, inputProps, frame: posterFrame, output: path.join(candidate, "poster.jpg"), imageFormat: "jpeg", jpegQuality: 90, ...browserOptions, logLevel: "error" });
    await writeFile(path.join(candidate, "captions.vtt"), webVtt(manifest));
    await writeFile(path.join(candidate, "proof.json"), proofBytes);
    if (options["--still-only"]) {
      const preview = path.join(output, "preview");
      await mkdir(preview, { recursive: true });
      for (const filename of ["poster.jpg", "captions.vtt", "proof.json"]) await rename(path.join(candidate, filename), path.join(preview, filename));
      console.log("Actual captured-frame poster and captions rendered in preview/; no video requested.");
      return;
    }
    stage = "video rendering";
    const video = path.join(candidate, "walkthrough.mp4");
    await renderMedia({ serveUrl, composition, inputProps, codec: "h264", pixelFormat: "yuv420p", outputLocation: video, videoBitrate: "1000k", encodingMaxRate: "1200k", encodingBufferSize: "2000k", x264Preset: "slow", imageFormat: "png", concurrency: 2, muted: true, ...browserOptions, logLevel: "error" });
    stage = "size budget verification";
    const bytes = await readFile(video);
    requireInput(bytes.length < MAX_VIDEO_BYTES, "MP4 exceeded the 15 MB budget; do not publish this candidate.");
    await writeFile(path.join(candidate, "render-report.json"), JSON.stringify({
      schemaVersion: 1, width: 1920, height: 1080, fps: composition.fps, durationSeconds: 90,
      source: manifest.source, edited: true, sampledCapture: true, noExternalModelCall: true,
      proofStatus: proof.status, manifestSha256: hash(manifestBytes), proofSha256: hash(proofBytes),
      video: { file: "walkthrough.mp4", bytes: bytes.length, sha256: hash(bytes) },
      capturedFrames: [...validated.capturedFiles.values()], posterFrame,
    }, null, 2) + "\n");
    // Render all candidates before replacing published artifacts. Invalidate the
    // prior report during promotion so an interruption cannot leave a stale
    // success/hash report beside any newly promoted files.
    stage = "artifact promotion";
    await rm(path.join(output, "render-report.json"), { force: true });
    for (const filename of ["poster.jpg", "captions.vtt", "proof.json", "walkthrough.mp4", "render-report.json"]) await rename(path.join(candidate, filename), path.join(output, filename));
    console.log(`Rendered actual walkthrough: 1920×1080, 90 seconds, ${(bytes.length / 1_000_000).toFixed(2)} MB; poster, WebVTT, proof and hash report written.`);
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(`Walkthrough failed during ${stage}; raw media/input diagnostics were withheld.`);
  } finally {
    process.chdir(invocationDirectory);
    if (work && !keepStudioAssets) await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof InputError ? error.message : "Walkthrough renderer failed; raw diagnostics were withheld.");
    process.exitCode = 1;
  });
}
