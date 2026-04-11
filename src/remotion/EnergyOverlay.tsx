import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';

interface EnergyOverlayProps {
  energyProfile: number[]; // normalized RMS values (0.0–1.0 range)
}

/**
 * Renders the energy profile as a horizontal intensity bar at the bottom
 * of the frame. The current frame position is highlighted.
 */
export const EnergyOverlay: React.FC<EnergyOverlayProps> = ({
  energyProfile,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();

  if (energyProfile.length === 0) {
    return null;
  }

  const barHeight = 40;

  // Map each energy sample to a segment of the bar
  const segmentWidth = width / energyProfile.length;

  // Determine which energy segment corresponds to the current frame
  const progress = durationInFrames > 0 ? frame / durationInFrames : 0;
  const currentSegment = Math.floor(progress * energyProfile.length);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: barHeight,
        display: 'flex',
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      {energyProfile.map((energy, i) => {
        const isCurrent = i === currentSegment;
        const normalizedHeight = Math.max(energy, 0.05) * barHeight;

        return (
          <div
            key={i}
            style={{
              width: segmentWidth,
              height: normalizedHeight,
              backgroundColor: isCurrent
                ? 'rgba(250, 204, 21, 0.8)'
                : 'rgba(255, 255, 255, 0.3)',
              transition: 'background-color 0.1s',
            }}
          />
        );
      })}
    </div>
  );
};
