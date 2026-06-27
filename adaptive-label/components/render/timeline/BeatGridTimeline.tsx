import { buildCycles } from "@/lib/domain/cycle-builder";
import type { BeatGridMetadata } from "@/lib/seed/types";
import { cn } from "@/lib/utils";
import type { TimelineModuleProps } from "./types";

/** The cycle sizes `buildCycles` accepts; anything else falls back to 8. */
const VALID_BEATS_PER_CYCLE = new Set([4, 8, 16, 32]);

function normalizeBeatsPerCycle(value: number): 4 | 8 | 16 | 32 {
  return (VALID_BEATS_PER_CYCLE.has(value) ? value : 8) as 4 | 8 | 16 | 32;
}

/**
 * Bachata beat-grid timeline (Req 3.1). Consumes seeded `BeatGridMetadata`
 * (produced offline by the `beat_this` analyzer) and renders beat markers plus
 * an 8/16/32-count phrase display.
 *
 * The grid math is NOT recomputed inline: this module reuses the transplanted
 * pure `buildCycles` (Task 5) to assemble the cycle hierarchy (base cycles,
 * 16-count phrases, 32-count phrases) from the seeded beat frames/timestamps.
 */
export function BeatGridTimeline({
  metadata,
  className,
}: TimelineModuleProps<BeatGridMetadata>) {
  const { beatGrid, phrasing } = metadata;
  const beatsPerCycle = normalizeBeatsPerCycle(phrasing.beatsPerCycle);

  // Reuse the transplanted beat/cycle math rather than recomputing grid
  // structure here (Task 8.3 / Req 3.1).
  const hierarchy = buildCycles(
    beatGrid.beat_frames,
    beatGrid.beat_timestamps,
    phrasing.downbeatIndex,
    beatsPerCycle,
  );

  const beatCount = beatGrid.beat_timestamps.length;

  return (
    <div
      data-testid="beat-grid-timeline"
      data-timeline-mode="beat_grid"
      aria-label="Beat-grid timeline"
      className={cn("flex flex-col gap-3 text-sm", className)}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-semibold text-foreground">
          {beatGrid.bpm} BPM
        </span>
        <span data-testid="beat-count" className="text-muted-foreground">
          {beatCount} beats
        </span>
        <span data-testid="cycle-count" className="text-muted-foreground">
          {hierarchy.cycles8.length} × {beatsPerCycle}-count cycles
        </span>
        <span data-testid="phrase16-count" className="text-muted-foreground">
          {hierarchy.phrases16.length} × 16-count phrases
        </span>
        <span data-testid="phrase32-count" className="text-muted-foreground">
          {hierarchy.phrases32.length} × 32-count phrases
        </span>
      </div>

      {/* Beat markers, one per seeded beat. */}
      <ol
        aria-label="Beat markers"
        className="flex flex-wrap gap-1"
      >
        {beatGrid.beat_timestamps.map((timestamp, index) => {
          const isDownbeat = index === phrasing.downbeatIndex;
          const beatInCycle =
            index >= phrasing.downbeatIndex
              ? ((index - phrasing.downbeatIndex) % beatsPerCycle) + 1
              : 0;
          return (
            <li
              key={`${index}-${timestamp}`}
              data-testid="beat-marker"
              data-frame={beatGrid.beat_frames[index]}
              data-timestamp={timestamp}
              data-downbeat={isDownbeat ? "true" : "false"}
              title={`Beat ${index + 1} @ ${timestamp}s (frame ${beatGrid.beat_frames[index]})`}
              className={cn(
                "flex h-7 min-w-7 items-center justify-center rounded border px-1 text-xs",
                isDownbeat
                  ? "border-primary bg-primary/10 font-semibold text-foreground"
                  : "border-input text-muted-foreground",
              )}
            >
              {beatInCycle || "·"}
            </li>
          );
        })}
      </ol>

      {/* 8/16/32-count phrase display derived from the cycle hierarchy. */}
      <div className="flex flex-col gap-2">
        <PhraseRow
          label={`${beatsPerCycle}-count cycles`}
          testid="cycle-row"
          items={hierarchy.cycles8.map((c) => ({
            key: c.cycleNumber,
            label: `C${c.cycleNumber}`,
          }))}
        />
        <PhraseRow
          label="16-count phrases"
          testid="phrase16-row"
          items={hierarchy.phrases16.map((p) => ({
            key: p.phraseNumber,
            label: `P${p.phraseNumber}`,
          }))}
        />
        <PhraseRow
          label="32-count phrases"
          testid="phrase32-row"
          items={hierarchy.phrases32.map((p) => ({
            key: p.phraseNumber,
            label: `P${p.phraseNumber}`,
          }))}
        />
      </div>
    </div>
  );
}

interface PhraseRowProps {
  label: string;
  testid: string;
  items: { key: number; label: string }[];
}

function PhraseRow({ label, testid, items }: PhraseRowProps) {
  return (
    <div data-testid={testid} className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {items.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          items.map((item) => (
            <span
              key={item.key}
              className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
            >
              {item.label}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
