import type {
  GlossPhrase,
  GlossSegment,
  GlossSegmentsMetadata,
} from "@/lib/seed/types";
import { cn } from "@/lib/utils";
import type { TimelineModuleProps } from "./types";

/**
 * Sign-language gloss-segment timeline (Req 3.2). Consumes seeded
 * `GlossSegmentsMetadata` (hand-authored offline) and renders the individual
 * sign boundaries grouped by the phrases/sentences they belong to.
 *
 * Segments are bucketed under their `phrase`, preserving the seeded order, so
 * the display shows both sign boundaries and the phrase grouping that the
 * sign-language domain requires.
 */
export function GlossSegmentTimeline({
  metadata,
  className,
}: TimelineModuleProps<GlossSegmentsMetadata>) {
  const { glossSegments, phrases } = metadata;

  const segmentsByPhrase = groupSegmentsByPhrase(glossSegments, phrases);

  return (
    <div
      data-testid="gloss-segment-timeline"
      data-timeline-mode="gloss_segments"
      aria-label="Gloss-segment timeline"
      className={cn("flex flex-col gap-3 text-sm", className)}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span data-testid="segment-count" className="text-muted-foreground">
          {glossSegments.length} signs
        </span>
        <span data-testid="phrase-count" className="text-muted-foreground">
          {phrases.length} phrases
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {segmentsByPhrase.map(({ phrase, segments }) => (
          <section
            key={phrase ? phrase.phrase : "__ungrouped__"}
            data-testid="gloss-phrase"
            data-phrase={phrase ? phrase.phrase : "none"}
            aria-label={phrase ? phrase.label : "Ungrouped signs"}
            className="flex flex-col gap-1 rounded-md border border-input p-2"
          >
            <header className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">
                {phrase ? phrase.label : "Ungrouped signs"}
              </span>
              {phrase ? (
                <span className="text-xs text-muted-foreground">
                  {phrase.startSeconds}s – {phrase.endSeconds}s
                </span>
              ) : null}
            </header>
            <ol aria-label="Sign boundaries" className="flex flex-wrap gap-1">
              {segments.map((segment) => (
                <li
                  key={segment.index}
                  data-testid="gloss-segment"
                  data-index={segment.index}
                  data-start-frame={segment.startFrame}
                  data-end-frame={segment.endFrame}
                  title={`${segment.gloss} (${segment.sign_type}) ${segment.startSeconds}s–${segment.endSeconds}s`}
                  className="rounded border border-input bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                >
                  {segment.gloss}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

interface PhraseBucket {
  /** The phrase this bucket represents, or null for orphaned segments. */
  phrase: GlossPhrase | null;
  segments: GlossSegment[];
}

/**
 * Buckets gloss segments under their declared `phrase`, preserving phrase order
 * from the metadata. Segments whose `phrase` has no matching phrase entry are
 * collected into a trailing ungrouped bucket so nothing is dropped.
 */
function groupSegmentsByPhrase(
  segments: GlossSegment[],
  phrases: GlossPhrase[],
): PhraseBucket[] {
  const buckets = new Map<number, PhraseBucket>();
  for (const phrase of phrases) {
    buckets.set(phrase.phrase, { phrase, segments: [] });
  }

  const orphans: GlossSegment[] = [];
  for (const segment of segments) {
    const bucket = buckets.get(segment.phrase);
    if (bucket) {
      bucket.segments.push(segment);
    } else {
      orphans.push(segment);
    }
  }

  const result: PhraseBucket[] = phrases.map(
    (phrase) => buckets.get(phrase.phrase)!,
  );
  if (orphans.length > 0) {
    result.push({ phrase: null, segments: orphans });
  }
  return result;
}
