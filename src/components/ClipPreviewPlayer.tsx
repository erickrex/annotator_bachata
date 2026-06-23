import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { VirtualClipDef } from '../types/index.js';

export interface ClipPreviewPlayerProps {
  clip: VirtualClipDef;
  beatMarkerFrames: number[];
  energyProfile: number[];
  /** Fallback source video URL for unextracted clips */
  sourceVideoPath?: string;
  onFrameChange?: (frame: number) => void;
  onNextClip?: () => void;
  onPrevClip?: () => void;
  /** Whether to show the beat/energy overlay (default: false) */
  showOverlay?: boolean;
}

/**
 * Compute the media URL for a clip's extracted MP4.
 */
function resolveExtractedUrl(extractedFile: string): string {
  return `/api/media/${extractedFile.split('/').map(encodeURIComponent).join('/')}`;
}

export const ClipPreviewPlayer: React.FC<ClipPreviewPlayerProps> = ({
  clip,
  beatMarkerFrames,
  energyProfile,
  sourceVideoPath,
  onFrameChange,
  onNextClip,
  onPrevClip,
  showOverlay = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const prevClipIdRef = useRef<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [videoSize, setVideoSize] = useState({ width: 640, height: 360 });
  const [overlayVisible, setOverlayVisible] = useState(showOverlay);

  const fps = clip.remotion.fps || 30;

  // Determine if we're using the extracted file or falling back to source video
  const hasExtracted = Boolean(clip.extractedFile);

  // Compute the effective in/out points in seconds
  // For extracted clips: relative to the extracted file (which includes handles)
  // For source fallback: absolute position in the source video
  const inPoint = hasExtracted
    ? (clip.inPoint ?? clip.handleBefore ?? 0)
    : (clip.remotion.fromFrame / fps);
  const outPoint = hasExtracted
    ? (clip.outPoint ?? ((clip.handleBefore ?? 0) + clip.remotion.durationInFrames / fps))
    : ((clip.remotion.fromFrame + clip.remotion.durationInFrames) / fps);

  // Convert current time to frame number relative to the trimmed region
  const timeToFrame = useCallback((time: number): number => {
    return Math.floor((time - inPoint) * fps);
  }, [inPoint, fps]);

  // Draw beat markers and energy profile on the canvas overlay
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    if (!overlayVisible) return;

    const currentTime = video.currentTime;
    const duration = outPoint - inPoint;
    if (duration <= 0) return;

    // Draw energy profile as semi-transparent bar chart along the bottom
    if (energyProfile.length > 0) {
      const barWidth = width / energyProfile.length;
      const maxBarHeight = height * 0.15;
      ctx.fillStyle = 'rgba(0, 200, 255, 0.3)';

      for (let i = 0; i < energyProfile.length; i++) {
        const value = Math.min(1, Math.max(0, energyProfile[i] ?? 0));
        const barHeight = value * maxBarHeight;
        ctx.fillRect(
          i * barWidth,
          height - barHeight,
          barWidth - 1,
          barHeight,
        );
      }
    }

    // Draw beat markers as vertical lines
    if (beatMarkerFrames.length > 0) {
      const totalFrames = duration * fps;

      for (let i = 0; i < beatMarkerFrames.length; i++) {
        const frame = beatMarkerFrames[i];
        const x = (frame / totalFrames) * width;

        if (x < 0 || x > width) continue;

        // Color-code: every 4th beat (downbeat) is brighter
        const isDownbeat = i % 4 === 0;
        ctx.strokeStyle = isDownbeat
          ? 'rgba(255, 100, 100, 0.9)'
          : 'rgba(255, 255, 100, 0.5)';
        ctx.lineWidth = isDownbeat ? 2 : 1;

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height * 0.85);
        ctx.stroke();
      }
    }

    // Draw playhead position indicator
    const progress = (currentTime - inPoint) / duration;
    if (progress >= 0 && progress <= 1) {
      const x = progress * width;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }, [overlayVisible, beatMarkerFrames, energyProfile, inPoint, outPoint, fps]);

  // Animation loop for canvas redraw
  const startAnimationLoop = useCallback(() => {
    const loop = () => {
      drawOverlay();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, [drawOverlay]);

  const stopAnimationLoop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
  }, []);

  // Handle clip change: pause and reset
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (prevClipIdRef.current !== null && prevClipIdRef.current !== clip.clipId) {
      video.pause();
      setIsPlaying(false);
      setVideoError(false);
    }
    prevClipIdRef.current = clip.clipId;
  }, [clip.clipId]);

  // Set video to inPoint when clip loads or changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      video.currentTime = inPoint;
      setVideoSize({
        width: video.videoWidth || 640,
        height: video.videoHeight || 360,
      });
      drawOverlay();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [clip.clipId, clip.extractedFile, inPoint, drawOverlay]);

  // Clamp playback to outPoint
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.currentTime >= outPoint) {
        video.currentTime = inPoint;
      }
      if (video.currentTime < inPoint) {
        video.currentTime = inPoint;
      }

      const frame = timeToFrame(video.currentTime);
      onFrameChange?.(Math.max(0, frame));
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [inPoint, outPoint, timeToFrame, onFrameChange]);

  // Start/stop animation loop based on play state
  useEffect(() => {
    if (isPlaying) {
      startAnimationLoop();
    } else {
      stopAnimationLoop();
      // Draw one final frame when paused
      drawOverlay();
    }
    return () => stopAnimationLoop();
  }, [isPlaying, startAnimationLoop, stopAnimationLoop, drawOverlay]);

  // Handle video error
  const handleVideoError = useCallback(() => {
    setVideoError(true);
    setIsPlaying(false);
  }, []);

  // Retry loading video
  const handleRetry = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setVideoError(false);
    video.load();
  }, []);

  // Play/pause toggle
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      // Ensure we're within bounds before playing
      if (video.currentTime < inPoint || video.currentTime >= outPoint) {
        video.currentTime = inPoint;
      }
      video.play().catch(() => { /* ignore autoplay errors */ });
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [inPoint, outPoint]);

  // Frame step forward
  const stepForward = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.paused) return;

    const newTime = Math.min(video.currentTime + 1 / fps, outPoint - 1 / fps);
    video.currentTime = newTime;
    const frame = timeToFrame(newTime);
    onFrameChange?.(Math.max(0, frame));
    drawOverlay();
  }, [fps, outPoint, timeToFrame, onFrameChange, drawOverlay]);

  // Frame step backward
  const stepBackward = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.paused) return;

    const newTime = Math.max(video.currentTime - 1 / fps, inPoint);
    video.currentTime = newTime;
    const frame = timeToFrame(newTime);
    onFrameChange?.(Math.max(0, frame));
    drawOverlay();
  }, [fps, inPoint, timeToFrame, onFrameChange, drawOverlay]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ': {
          e.preventDefault();
          togglePlayPause();
          break;
        }
        case ',': {
          e.preventDefault();
          stepBackward();
          break;
        }
        case '.': {
          e.preventDefault();
          stepForward();
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          onPrevClip?.();
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          onNextClip?.();
          break;
        }
      }
    },
    [togglePlayPause, stepBackward, stepForward, onPrevClip, onNextClip],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); };
  }, [handleKeyDown]);

  // Handle play/pause state sync
  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);

  // --- Render ---

  // Not yet extracted placeholder (only show if no source fallback either)
  if (!clip.extractedFile && !sourceVideoPath) {
    return (
      <div
        style={{
          width: '100%',
          aspectRatio: '16/9',
          background: '#111',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          color: '#888',
          fontSize: '0.9rem',
        }}
      >
        Not yet extracted
      </div>
    );
  }

  // Error state
  if (videoError) {
    return (
      <div
        style={{
          width: '100%',
          aspectRatio: '16/9',
          background: '#1a0a0a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          gap: 12,
        }}
      >
        <div style={{ color: '#ff6b6b', fontSize: '0.9rem' }}>
          Failed to load video for clip {clip.clipId}
        </div>
        <button
          onClick={handleRetry}
          style={{
            padding: '6px 14px',
            borderRadius: 4,
            border: '1px solid #555',
            background: '#222',
            color: '#ddd',
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const videoSrc = clip.extractedFile
    ? resolveExtractedUrl(clip.extractedFile)
    : sourceVideoPath!;

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <div
        style={{ position: 'relative', width: '100%', aspectRatio: '16/9', cursor: 'pointer' }}
        onClick={togglePlayPause}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          onError={handleVideoError}
          onPlay={handlePlay}
          onPause={handlePause}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            background: '#000',
            borderRadius: 4,
          }}
          preload="auto"
        />
        <canvas
          ref={canvasRef}
          width={videoSize.width}
          height={videoSize.height}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        />
        {/* Play/pause overlay icon */}
        {!isPlaying && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <polygon points="6,4 20,12 6,20" />
            </svg>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ fontSize: 12, color: '#888' }}>
          Space: play/pause &middot; &larr;/&rarr;: prev/next clip &middot; ,/.: frame step
          {isPlaying ? ' (playing)' : ' (paused)'}
        </div>
        <button
          onClick={() => setOverlayVisible((v) => !v)}
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 3,
            border: '1px solid #444',
            background: overlayVisible ? '#335' : '#222',
            color: overlayVisible ? '#aaf' : '#888',
            cursor: 'pointer',
          }}
        >
          {overlayVisible ? 'Hide beats' : 'Show beats'}
        </button>
      </div>
    </div>
  );
};
