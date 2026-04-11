import React from 'react';
import { Composition } from 'remotion';
import { VirtualClip, type VirtualClipProps } from './VirtualClip.js';

type VirtualClipRecord = VirtualClipProps & Record<string, unknown>;

/**
 * Remotion Root component that registers the VirtualClip composition
 * with dynamic fps, dimensions, and frame count.
 */
export const Root: React.FC = () => {
  return (
    <Composition
      id="VirtualClip"
      component={VirtualClip as React.FC<VirtualClipRecord>}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        src: '',
        startFrame: 0,
        durationInFrames: 300,
        beatMarkers: [] as number[],
        energyProfile: [] as number[],
      }}
    />
  );
};
