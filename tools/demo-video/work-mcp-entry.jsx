import React from "react";
import { Composition, registerRoot } from "remotion";
import { WorkMcpWalkthrough } from "./work-mcp-composition.jsx";

function Root() {
  return <Composition id="WorkMcpEvidence" component={WorkMcpWalkthrough} width={1920} height={1080} fps={5} durationInFrames={300} defaultProps={{ evidence: null }} />;
}

registerRoot(Root);
