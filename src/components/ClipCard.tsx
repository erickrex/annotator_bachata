import React from 'react';
import type { ClipStatus, VirtualClipDef } from '../types/index.js';

export interface ClipCardProps {
  clip: VirtualClipDef;
  completeness: number;
  selected: boolean;
  onClick: () => void;
}

const STATUS_COLORS: Record<ClipStatus, string> = {
  pending: '#888',
  discarded: '#c44',
  reviewed: '#4a4',
  in_progress: '#da4',
  annotated: '#48c',
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const ClipCard: React.FC<ClipCardProps> = ({ clip, completeness, selected, onClick }) => {
  const { remotion, cycleNumber, beatCount, status, clipId } = clip;
  const startSec = remotion.fromFrame / remotion.fps;
  const endSec = (remotion.fromFrame + remotion.durationInFrames) / remotion.fps;
  const pct = Math.round(completeness * 100);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      aria-selected={selected}
      style={{
        padding: '8px 10px',
        marginBottom: 4,
        borderRadius: 4,
        cursor: 'pointer',
        border: selected ? '2px solid #48f' : '1px solid #444',
        background: selected ? '#1a2a40' : '#1a1a1a',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#aaa', fontFamily: 'monospace' }}>{clipId}</span>
        <span
          style={{
            fontSize: 11,
            padding: '1px 6px',
            borderRadius: 3,
            background: STATUS_COLORS[status] ?? '#888',
            color: '#fff',
          }}
        >
          {status}
        </span>
      </div>
      <div style={{ fontSize: 13, marginTop: 4, color: '#ddd' }}>
        {formatTime(startSec)} – {formatTime(endSec)} &middot; Cycle {cycleNumber} &middot; {beatCount} beats
      </div>
      {/* Completeness bar */}
      <div style={{ marginTop: 4, height: 4, background: '#333', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#48c', borderRadius: 2 }} />
      </div>
      <div style={{ fontSize: 10, color: '#777', marginTop: 2 }}>{pct}% complete</div>
    </div>
  );
};
