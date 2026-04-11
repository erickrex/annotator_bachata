import React from 'react';
import { useCurrentFrame } from 'remotion';

interface BeatOverlayProps {
  beatMarkers: number[]; // frame numbers relative to clip start
}

/**
 * Renders a beat count indicator overlay.
 * Count 1 gets a large red indicator, count 5 gets a medium blue indicator,
 * others get small white indicators.
 */
export const BeatOverlay: React.FC<BeatOverlayProps> = ({ beatMarkers }) => {
  const frame = useCurrentFrame();

  // Determine which beat we're currently on (1-indexed within an 8-count cycle)
  let currentBeatIndex = 0;
  for (let i = 0; i < beatMarkers.length; i++) {
    if (frame >= beatMarkers[i]) {
      currentBeatIndex = i;
    } else {
      break;
    }
  }

  // Beat count within an 8-count bachata cycle (1-8)
  const beatCount = (currentBeatIndex % 8) + 1;

  const isCount1 = beatCount === 1;
  const isCount5 = beatCount === 5;

  const size = isCount1 ? 48 : isCount5 ? 36 : 24;
  const color = isCount1 ? '#ef4444' : isCount5 ? '#3b82f6' : '#ffffff';
  const fontSize = isCount1 ? 24 : isCount5 ? 18 : 14;

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        color: isCount1 || isCount5 ? '#ffffff' : '#000000',
        fontSize,
        fontWeight: 'bold',
        fontFamily: 'monospace',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      }}
    >
      {beatCount}
    </div>
  );
};
