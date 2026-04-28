// ReviewApp — top-level React island for the review page.
// Fetches clips and annotations from the API and wires all sub-components.

import React, { useCallback, useEffect, useState } from 'react';
import type {
  ClipAnnotation,
  EnumDefinitions,
  SourceRecord,
  ValidationError,
  VirtualClipDef,
} from '../types/index.js';
import { DEFAULT_ENUM_DEFINITIONS } from '../types/enums.js';
import { ClipGrid } from './ClipGrid.js';
import { PlayerWrapper } from './PlayerWrapper.js';
import { AnnotationForm } from './AnnotationForm.js';

function resolveMediaUrl(relativePath: string): string {
  if (!relativePath) {
    return '';
  }

  const encodedPath = relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `/api/media/${encodedPath}`;
}

export const ReviewApp: React.FC = () => {
  const [clips, setClips] = useState<VirtualClipDef[]>([]);
  const [annotations, setAnnotations] = useState<Map<string, ClipAnnotation>>(new Map());
  const [sources, setSources] = useState<Map<string, SourceRecord>>(new Map());
  const [completenessMap, setCompletenessMap] = useState<Map<string, number>>(new Map());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [completeness, setCompleteness] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadReviewState = useCallback(async (preferredClipId: string | null = null) => {
    try {
      setLoadError(null);
      const res = await fetch('/api/clips');
      if (!res.ok) {
        throw new Error(`Failed to load clips (HTTP ${res.status})`);
      }

      const data = await res.json();
      const nextClips = Array.isArray(data.clips) ? data.clips as Array<VirtualClipDef & { completeness?: number }> : [];
      const nextAnnotations = new Map(
        Array.isArray(data.annotations)
          ? data.annotations.map((annotation: ClipAnnotation) => [annotation.clip_id, annotation])
          : [],
      );
      const nextSources = new Map(
        Array.isArray(data.sources)
          ? data.sources.map((source: SourceRecord) => [source.source_id, source])
          : [],
      );
      const nextCompletenessMap = new Map(
        nextClips.map((clip) => [clip.clipId, clip.completeness ?? 0]),
      );

      setClips(nextClips);
      setAnnotations(nextAnnotations);
      setSources(nextSources);
      setCompletenessMap(nextCompletenessMap);

      const nextSelectedClipId = preferredClipId && nextClips.some((clip) => clip.clipId === preferredClipId)
        ? preferredClipId
        : nextClips.find((clip) => clip.status !== 'discarded')?.clipId ?? nextClips[0]?.clipId ?? null;

      setSelectedClipId(nextSelectedClipId);
      setCurrentFrame(0);
      setValidationErrors([]);
      setCompleteness(nextSelectedClipId ? nextCompletenessMap.get(nextSelectedClipId) ?? 0 : 0);
    } catch (error) {
      console.error('Failed to load review state', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load clips');
    }
  }, []);

  useEffect(() => {
    void loadReviewState();
  }, [loadReviewState]);

  const selectedClip = clips.find((c) => c.clipId === selectedClipId) ?? null;
  const selectedAnnotation = selectedClipId ? annotations.get(selectedClipId) ?? null : null;

  const handleFrameChange = useCallback((frame: number) => {
    setCurrentFrame(frame);
  }, []);

  const handleNextClip = useCallback(() => {
    const nonDiscarded = clips.filter((c) => c.status !== 'discarded');
    if (nonDiscarded.length === 0) return;
    const currentIndex = nonDiscarded.findIndex((c) => c.clipId === selectedClipId);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % nonDiscarded.length;
    setSelectedClipId(nonDiscarded[nextIndex].clipId);
    setCurrentFrame(0);
  }, [clips, selectedClipId]);

  const handlePrevClip = useCallback(() => {
    const nonDiscarded = clips.filter((c) => c.status !== 'discarded');
    if (nonDiscarded.length === 0) return;
    const currentIndex = nonDiscarded.findIndex((c) => c.clipId === selectedClipId);
    const prevIndex = currentIndex <= 0 ? nonDiscarded.length - 1 : currentIndex - 1;
    setSelectedClipId(nonDiscarded[prevIndex].clipId);
    setCurrentFrame(0);
  }, [clips, selectedClipId]);

  const handleSelectClip = useCallback((clipId: string) => {
    setSelectedClipId(clipId);
    setValidationErrors([]);
    setCompleteness(completenessMap.get(clipId) ?? 0);
    setCurrentFrame(0);
  }, [completenessMap]);

  const handleDiscardClip = useCallback(
    async (clipId: string) => {
      try {
        const res = await fetch(`/api/clips/${clipId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'discarded' }),
        });
        if (!res.ok) return;
        await loadReviewState();
      } catch (error) {
        console.error('Failed to discard clip', error);
      }
    },
    [loadReviewState],
  );

  const handleMergeClips = useCallback(
    async (clipIdA: string, clipIdB: string) => {
      try {
        const res = await fetch('/api/clips/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clipIdA, clipIdB }),
        });
        if (!res.ok) return;
        const data = await res.json();
        await loadReviewState(data.merged?.clipId ?? null);
      } catch (error) {
        console.error('Failed to merge clips', error);
      }
    },
    [loadReviewState],
  );

  const handleSplitClip = useCallback(
    async (clipId: string, splitAtFrame: number) => {
      try {
        const res = await fetch(`/api/clips/${clipId}/split`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ splitAtFrame }),
        });
        if (!res.ok) return;
        const data = await res.json();
        await loadReviewState(data.clips?.[0]?.clipId ?? null);
      } catch (error) {
        console.error('Failed to split clip', error);
      }
    },
    [loadReviewState],
  );

  const handleFieldChange = useCallback(
    async (fieldPath: string, value: unknown) => {
      if (!selectedClipId) return;
      // Build a partial annotation update from the dot-path
      const parts = fieldPath.split('.');
      let update: Record<string, unknown> = {};
      let current = update;
      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = {};
        current = current[parts[i]] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;

      try {
        const res = await fetch(`/api/clips/${selectedClipId}/annotation`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        });
        if (!res.ok) return;
        const data = await res.json();
        setValidationErrors(data.validationResult?.errors ?? []);
        setCompleteness(data.completeness ?? 0);

        if (data.annotation) {
          setAnnotations((prev) => {
            const next = new Map(prev);
            next.set(selectedClipId, data.annotation);
            return next;
          });
        }

        setCompletenessMap((prev) => {
          const next = new Map(prev);
          next.set(selectedClipId, data.completeness ?? 0);
          return next;
        });
      } catch (error) {
        console.error('Failed to update annotation', error);
      }
    },
    [selectedClipId],
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '280px 1fr 340px',
        flex: 1,
        minHeight: 0,
        width: '100%',
        height: '100%',
        gap: '1px',
        background: '#1a1a1a',
      }}
    >
      {loadError && (
        <div
          style={{
            gridColumn: '1 / -1',
            padding: 12,
            background: '#3a1515',
            color: '#ffb4b4',
            fontSize: 13,
            borderBottom: '1px solid #622',
          }}
        >
          {loadError}
        </div>
      )}
      <div style={{ background: '#0a0a0a', overflowY: 'auto', padding: 8, borderRight: '1px solid #222' }}>
        <ClipGrid
          clips={clips}
          annotations={annotations}
          completenessMap={completenessMap}
          selectedClipId={selectedClipId}
          onSelectClip={handleSelectClip}
          onDiscardClip={handleDiscardClip}
          onMergeClips={handleMergeClips}
          onSplitClip={handleSplitClip}
          currentFrame={currentFrame}
        />
      </div>
      <div
        style={{
          background: '#0a0a0a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selectedClip ? (
          <PlayerWrapper
            clip={selectedClip}
            sourceVideoPath={resolveMediaUrl(sources.get(selectedClip.sourceId)?.video_file ?? '')}
            sourceAudioPath={resolveMediaUrl(sources.get(selectedClip.sourceId)?.audio_file ?? '')}
            energyProfile={sources.get(selectedClip.sourceId)?.energy_profile ?? []}
            onFrameChange={handleFrameChange}
            onNextClip={handleNextClip}
            onPrevClip={handlePrevClip}
          />
        ) : (
          <div style={{ color: '#555', fontSize: '0.9rem' }}>
            {clips.length === 0 && !loadError
              ? 'No clips yet. Run ingest and “Generate clips” from the home page, then open /review again.'
              : 'Select a clip to preview'}
          </div>
        )}
      </div>
      <div style={{ background: '#0a0a0a', overflowY: 'auto', padding: 8, borderLeft: '1px solid #222' }}>
        {selectedClip && selectedAnnotation ? (
          <AnnotationForm
            clip={selectedClip}
            annotation={selectedAnnotation}
            enumDefinitions={DEFAULT_ENUM_DEFINITIONS}
            onFieldChange={handleFieldChange}
            validationErrors={validationErrors}
            completeness={completeness}
          />
        ) : (
          <div style={{ color: '#555', fontSize: '0.9rem' }}>Select a clip to annotate</div>
        )}
      </div>
    </div>
  );
};
