import React from "react";
import { Composition, registerRoot } from "remotion";

import { ClipComposition, type ClipCompositionProps } from "./ClipComposition";

const defaultProps: ClipCompositionProps = {
  videoSrc: "",
  startFrame: 0,
  beatMarkerFrames: [],
};

function RemotionClipComponent(props: Record<string, unknown>) {
  const frames = props.beatMarkerFrames;
  return (
    <ClipComposition
      videoSrc={typeof props.videoSrc === "string" ? props.videoSrc : ""}
      startFrame={typeof props.startFrame === "number" ? props.startFrame : 0}
      beatMarkerFrames={
        Array.isArray(frames)
          ? frames.filter((frame): frame is number => typeof frame === "number")
          : []
      }
    />
  );
}

export function RemotionRoot() {
  return (
    <Composition
      id="AdaptiveLabelClip"
      component={RemotionClipComponent}
      durationInFrames={240}
      fps={30}
      width={1280}
      height={720}
      defaultProps={defaultProps}
    />
  );
}

registerRoot(RemotionRoot);
