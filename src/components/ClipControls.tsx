import React, { useState } from 'react';

export interface ClipControlsProps {
  selectedClipId: string | null;
  clips: { clipId: string }[];
  currentFrame: number;
  onDiscardClip: (clipId: string) => void;
  onMergeClips: (clipIdA: string, clipIdB: string) => void;
  onSplitClip: (clipId: string, splitFrame: number) => void;
}

const btnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 4,
  border: '1px solid #555',
  background: '#2a2a2a',
  color: '#ddd',
  cursor: 'pointer',
  fontSize: 13,
};

export const ClipControls: React.FC<ClipControlsProps> = ({
  selectedClipId,
  clips,
  currentFrame,
  onDiscardClip,
  onMergeClips,
  onSplitClip,
}) => {
  const [mergeTargetId, setMergeTargetId] = useState<string>('');

  const selectedIdx = clips.findIndex((c) => c.clipId === selectedClipId);
  const adjacentClips: string[] = [];
  if (selectedIdx > 0) adjacentClips.push(clips[selectedIdx - 1].clipId);
  if (selectedIdx >= 0 && selectedIdx < clips.length - 1) adjacentClips.push(clips[selectedIdx + 1].clipId);

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0' }}>
      <button
        style={btnStyle}
        disabled={!selectedClipId}
        onClick={() => { if (selectedClipId) onDiscardClip(selectedClipId); }}
      >
        Discard
      </button>

      <button
        style={btnStyle}
        disabled={!selectedClipId || currentFrame <= 0}
        onClick={() => { if (selectedClipId) onSplitClip(selectedClipId, currentFrame); }}
      >
        Split at frame {currentFrame}
      </button>

      {adjacentClips.length > 0 && (
        <>
          <select
            value={mergeTargetId}
            onChange={(e) => setMergeTargetId(e.target.value)}
            style={{ ...btnStyle, minWidth: 120 }}
            aria-label="Select adjacent clip to merge"
          >
            <option value="">Merge with…</option>
            {adjacentClips.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
          <button
            style={btnStyle}
            disabled={!mergeTargetId || !selectedClipId}
            onClick={() => {
              if (selectedClipId && mergeTargetId) {
                onMergeClips(selectedClipId, mergeTargetId);
                setMergeTargetId('');
              }
            }}
          >
            Merge
          </button>
        </>
      )}
    </div>
  );
};
