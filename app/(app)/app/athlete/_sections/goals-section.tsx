import { loadGoalRace } from "@/lib/athlete/page-data";
import { GoalRaceEditor } from "../_goal-race-editor";
import { Subsection } from "./section-shell";

export async function GoalsSection({ athleteId }: { athleteId: string }) {
  const goalRace = await loadGoalRace(athleteId);
  return (
    <Subsection label="Your goal race">
      <GoalRaceEditor
        initial={
          goalRace
            ? {
                name: goalRace.name,
                raceDate: goalRace.raceDate,
                goalTimeSeconds: goalRace.goalTimeSeconds,
              }
            : null
        }
      />
    </Subsection>
  );
}
