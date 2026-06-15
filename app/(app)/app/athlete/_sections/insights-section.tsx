import { loadInsightItems } from "@/lib/athlete/page-data";
import { InsightsEditor } from "../_insights-editor";
import { Subsection } from "./section-shell";

/**
 * Casey's maintained read, made legible and correctable. Shows the working
 * set of insights Casey carries into every conversation, grouped by layer,
 * with dismiss + correct affordances. The empty state is honest: early on,
 * Casey hasn't formed a read yet.
 */
export async function InsightsSection({ athleteId }: { athleteId: string }) {
  const items = await loadInsightItems(athleteId);
  return (
    <Subsection
      label="What Casey's picked up"
      helper={items.length ? "Edit or dismiss" : undefined}
    >
      {items.length === 0 ? (
        <p className="text-[14px] leading-[1.55] text-ink-muted">
          Casey hasn&apos;t formed a read of your training yet. After a few
          debriefs and your first weekly review, what Casey has picked up about
          you will show here, and you can correct or dismiss any of it.
        </p>
      ) : (
        <InsightsEditor items={items} />
      )}
    </Subsection>
  );
}
