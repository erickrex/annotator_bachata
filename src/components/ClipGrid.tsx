import React from 'react';
import type { VirtualClipDef } from '../types/index.js';
import { ClipCard } from './ClipCard.js';
import { ClipControls } from './ClipControls.js';

export interface ClipGridProps {
  clips: VirtualClipDef[];
  completenessMap: Map<string, number>;
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onDiscardClip: (clipId: string) => void;
  onMergeClips: (clipIdA: string, clipIdB: string) => void;
  onSplitClip: (clipId: string, splitFrame: number) => void;
  currentFrame?: number;
}

export const ClipGrid: React.FC<ClipGridProps> = ({
  clips,
  completenessMap,
  selectedClipId,
  onSelectClip,
  onDiscardClip,
  onMergeClips,
  onSplitClip,
  currentFrame = 0,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ClipControls
        selectedClipId={selectedClipId}
        clips={clips}
        currentFrame={currentFrame}
        onDiscardClip={onDiscardClip}
        onMergeClips={onMergeClips}
        onSplitClip={onSplitClip}
      />
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 0',
        }}
        role="listbox"
        aria-label="Clip list"
      >
        {clips.map((clip) => (
          <ClipCard
            key={clip.clipId}
            clip={clip}
            completeness={completenessMap.get(clip.clipId) ?? 0}
            selected={clip.clipId === selectedClipId}
            onClick={() => onSelectClip(clip.clipId)}
          />
        ))}
        {clips.length === 0 && (
          <div style={{ color: '#666', padding: 16, textAlign: 'center' }}>
            No clips generated yet.
          </div>
        )}
      </div>
    </div>
  );
};
