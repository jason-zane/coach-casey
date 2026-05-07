import { formatNiggleHeader, loadTrackingItems } from "@/lib/athlete/page-data";
import { MemoryListEditor } from "../_memory-list-editor";
import { Subsection } from "./section-shell";

/**
 * Niggles + life context as two separate subsections. Voice rename:
 * "Niggles" became "On the radar" because the section heading should
 * carry the coach voice, not a clinical category label. The editor
 * underneath still treats them as kind=injury memory items.
 */
export async function TrackingSection({ athleteId }: { athleteId: string }) {
  const { niggles, lifeContext } = await loadTrackingItems(athleteId);
  return (
    <>
      <Subsection label="On the radar">
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
      </Subsection>

      <Subsection label="Life context" helper="Last 14 days">
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
      </Subsection>
    </>
  );
}
