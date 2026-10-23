import React from "react";
import { Composition, registerRoot } from "remotion";
import { Walkthrough } from "./composition.jsx";

function Root() {
  return (
    <Composition
      id="SyntheticWalkthrough"
      component={Walkthrough}
      width={1920}
      height={1080}
      fps={5}
      durationInFrames={450}
      defaultProps={{ manifest: null, proof: null }}
      calculateMetadata={({ props }) => ({
        fps: props.manifest?.fps ?? 5,
        durationInFrames: props.manifest
          ? Math.round(props.manifest.segments.reduce((sum, segment) => sum + segment.durationSeconds, 0) * props.manifest.fps)
          : 450,
      })}
    />
  );
}

registerRoot(Root);
