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

export const ReviewApp: React.FC = () => {
  const [clips, setClips] = useState<VirtualClipDef[]>([]);
  const [annotations, setAnnotations] = useState<Map<string, ClipAnnotation>>(new Map());
  const [sources, setSources] = useState<Map<string, SourceRecord>>(new Map());
  const [completenessMap, setCompletenessMap] = useState<Map<string, number>>(new Map());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [completeness, setCompleteness] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);

  // Load clips and annotations from the API on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/clips');
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.clips)) {
          setClips(data.clips);
          setCompletenessMap(
            new Map(data.clips.map((c: VirtualClipDef & { completeness?: number }) => [c.clipId, c.completeness ?? 0])),
          );
        }
        if (Array.isArray(data.annotations)) {
          setAnnotations(
            new Map(data.annotations.map((a: ClipAnnotation) => [a.clip_id, a])),
          );
        }
        if (Array.isArray(data.sources)) {
          setSources(
            new Map(data.sources.map((s: SourceRecord) => [s.source_id, s])),
          );
        }
      } catch {
        /* ignore */
      }
    }
    load();
  }, []);

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
  }, []);

  const handleDiscardClip = useCallback(
    async (clipId: string) => {
      try {
        const res = await fetch(`/api/clips/${clipId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'discarded' }),
        });
        if (!res.ok) return;
        setClips((prev) =>
          prev.map((c) => (c.clipId === clipId ? { ...c, status: 'discarded' as const } : c)),
        );
      } catch {
        /* ignore */
      }
    },
    [],
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
        setClips((prev) => {
          const filtered = prev.filter((c) => c.clipId !== clipIdA && c.clipId !== clipIdB);
          return [...filtered, data.merged];
        });
      } catch {
        /* ignore */
      }
    },
    [],
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
        setClips((prev) => {
          const filtered = prev.filter((c) => c.clipId !== clipId);
          return [...filtered, ...data.clips];
        });
      } catch {
        /* ignore */
      }
    },
    [],
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

        // Refresh the annotation for this clip
        const clipRes = await fetch(`/api/clips/${selectedClipId}`);
        if (clipRes.ok) {
          const clipData = await clipRes.json();
          if (clipData.annotation) {
            setAnnotations((prev) => {
              const next = new Map(prev);
              next.set(selectedClipId, clipData.annotation);
              return next;
            });
          }
        }
      } catch {
        /* ignore */
      }
    },
    [selectedClipId],
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '280px 1fr 340px',
        height: '100%',
        gap: '1px',
        background: '#1a1a1a',
      }}
    >
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
            sourceVideoPath={sources.get(selectedClip.sourceId)?.video_file ?? ''}
            onFrameChange={handleFrameChange}
            onNextClip={handleNextClip}
            onPrevClip={handlePrevClip}
          />
        ) : (
          <div style={{ color: '#555', fontSize: '0.9rem' }}>Select a clip to preview</div>
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
