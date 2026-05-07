import { loadMemoryProgress } from "@/lib/athlete/page-data";
import { Section } from "./section-shell";

export async function MemorySection({ athleteId }: { athleteId: string }) {
  const memory = await loadMemoryProgress(athleteId);
  return (
    <Section title="Memory">
      <p className="text-[14px] leading-[1.6] text-ink">
        Casey knows{" "}
        <span className="font-medium">
          {memory.runs} {memory.runs === 1 ? "run" : "runs"}
        </span>
        ,{" "}
        <span className="font-medium">
          {memory.crossTraining} cross-training{" "}
          {memory.crossTraining === 1 ? "session" : "sessions"}
        </span>
        , and you&rsquo;ve traded{" "}
        <span className="font-medium">
          {memory.caseyMessages}{" "}
          {memory.caseyMessages === 1 ? "message" : "messages"}
        </span>
        .
      </p>
    </Section>
  );
}
