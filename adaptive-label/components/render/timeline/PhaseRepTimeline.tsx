import * as React from "react";

import { cn } from "@/lib/utils";

export interface PhaseRepTimelineProps {
  className?: string;
}

/**
 * Roadmap stub for the `phase_rep` timeline mode (movement phase/rep counting,
 * e.g. fitness or physiotherapy domains). This mode is intentionally NOT seeded
 * in the demo, so the module renders a clear "not available in demo"
 * placeholder rather than fabricating data.
 *
 * Keeping it as a real, mountable module means `TimelineForMode` can select it
 * via the same fixed switch as the seeded modules, demonstrating that the
 * renderer is extensible without changing the dispatch contract.
 */
export function PhaseRepTimeline({ className }: PhaseRepTimelineProps) {
  return (
    <div
      data-testid="phase-rep-timeline"
      data-timeline-mode="phase_rep"
      aria-label="Phase/rep timeline"
      className={cn(
        "flex flex-col gap-1 rounded-md border border-dashed border-input p-4 text-sm",
        className,
      )}
    >
      <span className="font-semibold text-foreground">
        Phase / rep timeline
      </span>
      <span className="text-muted-foreground">
        This timeline mode is on the roadmap and is not available in the demo.
      </span>
    </div>
  );
}
