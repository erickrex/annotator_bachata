import React from 'react';
import { Audio, Html5Video } from 'remotion';
import { BeatOverlay } from './BeatOverlay.js';
import { EnergyOverlay } from './EnergyOverlay.js';

/** Tight enough to prevent visible replay jumps, loose enough for smooth streaming playback. */
const PREVIEW_ACCEPTABLE_TIME_SHIFT_SECONDS = 0.3;

export interface VirtualClipProps {
  src: string;
  /** Optional separate audio (e.g. extracted WAV); video is muted when set. */
  audioSrc?: string;
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
  audioSrc,
  startFrame,
  beatMarkers,
  energyProfile,
}) => {
  const useSeparateAudio = Boolean(audioSrc?.trim());

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Html5Video
        src={src}
        startFrom={startFrame}
        muted={useSeparateAudio}
        acceptableTimeShiftInSeconds={PREVIEW_ACCEPTABLE_TIME_SHIFT_SECONDS}
        onlyWarnForMediaSeekingError
        pauseWhenBuffering
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
      {useSeparateAudio ? (
        <Audio
          src={audioSrc!.trim()}
          startFrom={startFrame}
          acceptableTimeShiftInSeconds={PREVIEW_ACCEPTABLE_TIME_SHIFT_SECONDS}
          pauseWhenBuffering
        />
      ) : null}
      <BeatOverlay beatMarkers={beatMarkers} />
      <EnergyOverlay energyProfile={energyProfile} />
    </div>
  );
};
