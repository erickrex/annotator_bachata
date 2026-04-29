import React, { useCallback, useRef } from 'react';
import type { VirtualClipDef } from '../types/index.js';

export interface TrimControlsProps {
  clip: VirtualClipDef;
  currentFrame: number;
  onInPointChange: (seconds: number) => void;
  onOutPointChange: (seconds: number) => void;
}

const STEP = 0.033; // ~1 frame at 30fps

/**
 * Visual trim controls showing a timeline bar with in/out markers.
 * Allows fine-grained adjustment of clip boundaries within the extracted handle range.
 */
export const TrimControls: React.FC<TrimControlsProps> = ({
  clip,
  currentFrame,
  onInPointChange,
  onOutPointChange,
}) => {
  const barRef = useRef<HTMLDivElement>(null);

  const fps = clip.remotion.fps;
  const handleBefore = clip.handleBefore ?? 0;
  const handleAfter = clip.handleAfter ?? 0;
  const clipDuration = clip.remotion.durationInFrames / fps;
  const totalExtractedDuration = handleBefore + clipDuration + handleAfter;

  const inPoint = clip.inPoint ?? handleBefore;
  const outPoint = clip.outPoint ?? (handleBefore + clipDuration);

  // Current playhead position in the extracted file's timeline
  const playheadSeconds = handleBefore + (currentFrame / fps);

  // Convert seconds to percentage of the extracted file
  const toPercent = (s: number) => (s / totalExtractedDuration) * 100;

  const inPercent = toPercent(inPoint);
  const outPercent = toPercent(outPoint);
  const playheadPercent = toPercent(Math.min(playheadSeconds, totalExtractedDuration));
  const handleBeforePercent = toPercent(handleBefore);
  const handleAfterStart = toPercent(handleBefore + clipDuration);

  const activeDuration = outPoint - inPoint;

  const handleBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const clickedSeconds = x * totalExtractedDuration;

    // Determine if closer to in or out point
    const distToIn = Math.abs(clickedSeconds - inPoint);
    const distToOut = Math.abs(clickedSeconds - outPoint);

    if (distToIn < distToOut) {
      onInPointChange(Math.max(0, Math.min(clickedSeconds, outPoint - STEP)));
    } else {
      onOutPointChange(Math.max(inPoint + STEP, Math.min(clickedSeconds, totalExtractedDuration)));
    }
  }, [totalExtractedDuration, inPoint, outPoint, onInPointChange, onOutPointChange]);

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginBottom: 4 }}>
        <span>Trim Controls</span>
        <span>{activeDuration.toFixed(2)}s</span>
      </div>

      {/* Timeline bar */}
      <div
        ref={barRef}
        onClick={handleBarClick}
        style={{
          position: 'relative',
          height: 28,
          background: '#1a1a1a',
          borderRadius: 4,
          cursor: 'pointer',
          overflow: 'hidden',
          border: '1px solid #333',
        }}
      >
        {/* Handle regions (darker) */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${handleBeforePercent}%`,
          background: '#111',
        }} />
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: `${100 - handleAfterStart}%`,
          background: '#111',
        }} />

        {/* Active region (between in and out) */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${inPercent}%`,
          width: `${outPercent - inPercent}%`,
          background: '#1e3a5f',
        }} />

        {/* In-point marker */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${inPercent}%`,
          width: 3,
          background: '#4ade80',
          zIndex: 2,
        }} />

        {/* Out-point marker */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${outPercent}%`,
          width: 3,
          background: '#f87171',
          zIndex: 2,
        }} />

        {/* Playhead */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${playheadPercent}%`,
          width: 2,
          background: '#fff',
          zIndex: 3,
        }} />
      </div>

      {/* Numeric controls */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#aaa' }}>
          <span style={{ color: '#4ade80' }}>In:</span>
          <button
            onClick={() => onInPointChange(Math.max(0, inPoint - STEP))}
            style={nudgeBtnStyle}
            aria-label="Move in-point earlier"
          >−</button>
          <span style={{ minWidth: 48, textAlign: 'center', fontFamily: 'monospace', fontSize: 11 }}>
            {inPoint.toFixed(3)}s
          </span>
          <button
            onClick={() => onInPointChange(Math.min(outPoint - STEP, inPoint + STEP))}
            style={nudgeBtnStyle}
            aria-label="Move in-point later"
          >+</button>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#aaa' }}>
          <span style={{ color: '#f87171' }}>Out:</span>
          <button
            onClick={() => onOutPointChange(Math.max(inPoint + STEP, outPoint - STEP))}
            style={nudgeBtnStyle}
            aria-label="Move out-point earlier"
          >−</button>
          <span style={{ minWidth: 48, textAlign: 'center', fontFamily: 'monospace', fontSize: 11 }}>
            {outPoint.toFixed(3)}s
          </span>
          <button
            onClick={() => onOutPointChange(Math.min(totalExtractedDuration, outPoint + STEP))}
            style={nudgeBtnStyle}
            aria-label="Move out-point later"
          >+</button>
        </label>

        <button
          onClick={() => {
            onInPointChange(handleBefore);
            onOutPointChange(handleBefore + clipDuration);
          }}
          style={{ ...nudgeBtnStyle, padding: '3px 8px', fontSize: 11 }}
        >
          Reset
        </button>
      </div>
    </div>
  );
};

const nudgeBtnStyle: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: 3,
  border: '1px solid #444',
  background: '#2a2a2a',
  color: '#ddd',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1,
};
