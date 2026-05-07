import { formatNiggleHeader, loadTrackingItems } from "@/lib/athlete/page-data";
import { MemoryListEditor } from "../_memory-list-editor";
import { Section } from "./section-shell";

export async function TrackingSection({ athleteId }: { athleteId: string }) {
  const { niggles, lifeContext } = await loadTrackingItems(athleteId);
  return (
    <Section title="What Casey is tracking">
      <div className="space-y-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
          Niggles
        </h3>
        <MemoryListEditor
          kind="injury"
          addLabel={niggles.length > 0 ? "Add another" : "Add a niggle"}
          contentPlaceholder="What's going on, when did it start, when does it flare?"
          showTags={true}
          items={niggles.map((n) => ({
            id: n.id,
            content: n.content,
            tags: n.tags,
            dateLabel: `First mentioned ${new Date(
              n.firstMentionedAt,
            ).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}`,
            header: formatNiggleHeader(n),
          }))}
        />
      </div>

      <div className="space-y-3 pt-4">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
          Life context (last 14 days)
        </h3>
        <MemoryListEditor
          kind="context"
          addLabel={
            lifeContext.length > 0 ? "Add another" : "Add some life context"
          }
          contentPlaceholder="Travel, sleep, work pressure, anything Casey should hold for the next two weeks."
          showTags={false}
          items={lifeContext.map((c) => ({
            id: c.id,
            content: c.content,
            tags: c.tags,
            dateLabel: new Date(c.recordedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }),
            header: null,
          }))}
        />
      </div>
    </Section>
  );
}
