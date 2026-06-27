"use client";

import { Player } from "@remotion/player";

import { ClipComposition } from "@/remotion/ClipComposition";

export interface RemotionClipPlayerProps {
  videoSrc: string;
  startFrame: number;
  endFrame: number;
  fps: number;
  width?: number;
  height?: number;
  beatMarkerFrames?: number[];
}

export function RemotionClipPlayer({
  videoSrc,
  startFrame,
  endFrame,
  fps,
  width = 1280,
  height = 720,
  beatMarkerFrames = [],
}: RemotionClipPlayerProps) {
  const durationInFrames = Math.max(1, endFrame - startFrame + 1);

  return (
    <Player
      component={ClipComposition}
      compositionWidth={width}
      compositionHeight={height}
      durationInFrames={durationInFrames}
      fps={fps}
      controls
      style={{ width: "100%", height: "100%" }}
      inputProps={{
        videoSrc,
        startFrame,
        beatMarkerFrames,
      }}
    />
  );
}
