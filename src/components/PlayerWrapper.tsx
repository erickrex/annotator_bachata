import React, { useCallback, useEffect, useRef } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { VirtualClip } from '../remotion/VirtualClip.js';
import type { VirtualClipDef } from '../types/index.js';

export interface PlayerWrapperProps {
  clip: VirtualClipDef;
  sourceVideoPath: string;
  onFrameChange?: (frame: number) => void;
  onNextClip?: () => void;
  onPrevClip?: () => void;
}

export const PlayerWrapper: React.FC<PlayerWrapperProps> = ({
  clip,
  sourceVideoPath,
  onFrameChange,
  onNextClip,
  onPrevClip,
}) => {
  const playerRef = useRef<PlayerRef>(null);

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

  return (
    <div style={{ width: '100%' }}>
      <Player
        ref={playerRef}
        component={VirtualClip}
        compositionWidth={1920}
        compositionHeight={1080}
        durationInFrames={remotion.durationInFrames}
        fps={remotion.fps}
        controls
        loop
        style={{ width: '100%', aspectRatio: '16/9', background: '#000' }}
        inputProps={{
          src: sourceVideoPath,
          startFrame: remotion.fromFrame,
          durationInFrames: remotion.durationInFrames,
          beatMarkers: beatMarkerFrames,
          energyProfile: [],
        }}
      />
      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
        Space: play/pause &middot; ←/→: prev/next clip &middot; ,/.: frame step
      </div>
    </div>
  );
};
