import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface ClipCompositionProps {
  videoSrc: string;
  startFrame: number;
  beatMarkerFrames: number[];
}

export function ClipComposition({
  videoSrc,
  startFrame,
  beatMarkerFrames,
}: ClipCompositionProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const sourceFrame = startFrame + frame;
  const markers = beatMarkerFrames.filter(
    (marker) => marker >= startFrame && marker < startFrame + durationInFrames,
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "black", overflow: "hidden" }}>
      <OffthreadVideo
        src={videoSrc}
        startFrom={startFrame}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          backgroundColor: "black",
        }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 62%, rgba(0,0,0,0.72) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 24,
          right: 24,
          bottom: 22,
          height: 34,
          borderBottom: "2px solid rgba(255,255,255,0.72)",
        }}
      >
        {markers.map((marker) => {
          const x = ((marker - startFrame) / Math.max(durationInFrames, 1)) * 100;
          const isCurrent = Math.abs(marker - sourceFrame) <= 1;
          return (
            <div
              key={marker}
              style={{
                position: "absolute",
                left: `${x}%`,
                bottom: 0,
                width: isCurrent ? 4 : 2,
                height: isCurrent ? 34 : 22,
                backgroundColor: isCurrent ? "#22c55e" : "rgba(255,255,255,0.82)",
                transform: "translateX(-50%)",
              }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
