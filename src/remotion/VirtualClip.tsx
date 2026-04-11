import React from 'react';
import { OffthreadVideo } from 'remotion';
import { BeatOverlay } from './BeatOverlay.js';
import { EnergyOverlay } from './EnergyOverlay.js';

export interface VirtualClipProps {
  src: string;
  startFrame: number;
  durationInFrames: number;
  beatMarkers: number[];
  energyProfile: number[];
}

/**
 * Remotion component that renders a virtual clip segment of the source video
 * with beat marker and energy profile overlays.
 */
export const VirtualClip: React.FC<VirtualClipProps> = ({
  src,
  startFrame,
  beatMarkers,
  energyProfile,
}) => {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <OffthreadVideo src={src} startFrom={startFrame} />
      <BeatOverlay beatMarkers={beatMarkers} />
      <EnergyOverlay energyProfile={energyProfile} />
    </div>
  );
};
