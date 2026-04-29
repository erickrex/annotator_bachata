import React, { useCallback, useEffect, useRef } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { VirtualClip } from '../remotion/VirtualClip.js';
import type { VirtualClipDef } from '../types/index.js';

export interface PlayerWrapperProps {
  clip: VirtualClipDef;
  sourceVideoPath: string;
  /** Extracted WAV (same timeline as video); when set, preview plays this and mutes the MP4. */
  sourceAudioPath?: string;
  energyProfile: number[];
  onFrameChange?: (frame: number) => void;
  onNextClip?: () => void;
  onPrevClip?: () => void;
}

export const PlayerWrapper: React.FC<PlayerWrapperProps> = ({
  clip,
  sourceVideoPath,
  sourceAudioPath,
  energyProfile,
  onFrameChange,
  onNextClip,
  onPrevClip,
}) => {
  const playerRef = useRef<PlayerRef>(null);
  const prevClipIdRef = useRef<string | null>(null);

  // Seek to frame 0 when the clip changes
  useEffect(() => {
    if (prevClipIdRef.current !== null && prevClipIdRef.current !== clip.clipId) {
      const player = playerRef.current;
      if (player) {
        player.pause();
        player.seekTo(0);
      }
    }
    prevClipIdRef.current = clip.clipId;
  }, [clip.clipId]);

  // Frame change callback
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !onFrameChange) return;

    const handler = () => {
      const frame = player.getCurrentFrame();
      onFrameChange(frame);
    };

    player.addEventListener('frameupdate', handler);
    return () => { player.removeEventListener('frameupdate', handler); };
  }, [onFrameChange]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const player = playerRef.current;
      if (!player) return;

      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ': {
          e.preventDefault();
          if (player.isPlaying()) {
            player.pause();
          } else {
            player.play();
          }
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          onNextClip?.();
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          onPrevClip?.();
          break;
        }
        case '.': {
          e.preventDefault();
          player.pause();
          player.seekTo(player.getCurrentFrame() + 1);
          break;
        }
        case ',': {
          e.preventDefault();
          player.pause();
          const f = player.getCurrentFrame();
          player.seekTo(Math.max(0, f - 1));
          break;
        }
      }
    },
    [onNextClip, onPrevClip],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); };
  }, [handleKeyDown]);

  const { remotion, beatMarkerFrames } = clip;
  const hasExtracted = Boolean(clip.extractedFile);

  // For extracted clips: play from frame 0 (the file IS the clip + handles).
  // No startFrom needed — the file starts 1s before the clip and we just play it all.
  // For non-extracted clips: fall back to seeking into the full source (legacy behavior).
  const videoSrc = hasExtracted
    ? `/api/media/${clip.extractedFile!.split('/').map(encodeURIComponent).join('/')}`
    : sourceVideoPath;

  // For extracted clips, startFrame = 0 (play from the beginning of the short file).
  // The extracted file already contains only the relevant segment.
  const startFrame = hasExtracted ? 0 : remotion.fromFrame;

  // For extracted clips, the total duration is the full extracted file (clip + handles).
  // This lets the user see the handle footage for trim adjustment.
  const handleBeforeFrames = hasExtracted ? Math.round((clip.handleBefore ?? 0) * remotion.fps) : 0;
  const handleAfterFrames = hasExtracted ? Math.round((clip.handleAfter ?? 0) * remotion.fps) : 0;
  const totalDurationInFrames = hasExtracted
    ? handleBeforeFrames + remotion.durationInFrames + handleAfterFrames
    : remotion.durationInFrames;

  // For extracted clips, audio is muxed in — no separate audio needed.
  const audioSrc = hasExtracted ? undefined : sourceAudioPath;

  return (
    <div style={{ width: '100%' }}>
      <Player
        key={clip.clipId}
        ref={playerRef}
        component={VirtualClip}
        compositionWidth={1920}
        compositionHeight={1080}
        durationInFrames={totalDurationInFrames}
        fps={remotion.fps}
        controls
        loop
        bufferStateDelayInMilliseconds={500}
        numberOfSharedAudioTags={6}
        style={{ width: '100%', aspectRatio: '16/9', background: '#000' }}
        inputProps={{
          src: videoSrc,
          audioSrc,
          startFrame,
          durationInFrames: totalDurationInFrames,
          beatMarkers: beatMarkerFrames,
          energyProfile,
        }}
      />
      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
        Space: play/pause &middot; &larr;/&rarr;: prev/next clip &middot; ,/.: frame step
      </div>
    </div>
  );
};
