export type FixtureActivity = {
  strava_id: number;
  start_date_local: string;
  name: string;
  activity_type: string;
  distance_m: number;
  moving_time_s: number;
  avg_pace_s_per_km: number;
  avg_hr: number;
  max_hr: number;
  elevation_gain_m: number;
};

// A plausible 10-week block for a ~3:00 marathon runner training in AU/NZ.
// ~65km/week average. Sunday long runs, Wednesday quality, Tuesday/Thursday
// easy, Saturday recovery, Friday rest. Embeds small patterns the validation
// moment can legitimately reflect back:
//   - Long runs creep up from 22 to 32 km
//   - A "missing" week mid-block (sick / travel)
//   - One Saturday that ran faster than usual easy pace
//   - HR slightly drifting on a hot long run
const DAY_MS = 24 * 60 * 60 * 1000;

type SessionSpec = {
  offset: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday
  kind: "easy" | "long" | "workout" | "recovery" | "progression";
  km: number;
  paceSPerKm: number;
  avgHr: number;
  name: string;
  elev?: number;
};

const WEEKS: SessionSpec[][] = [
  // Week 1, base
  [
    { offset: 1, kind: "easy", km: 10, paceSPerKm: 320, avgHr: 142, name: "Easy shakeout" },
    { offset: 2, kind: "workout", km: 12, paceSPerKm: 260, avgHr: 164, name: "5 x 1km at threshold" },
    { offset: 3, kind: "easy", km: 8, paceSPerKm: 325, avgHr: 140, name: "Easy" },
    { offset: 5, kind: "recovery", km: 6, paceSPerKm: 335, avgHr: 136, name: "Recovery jog" },
    { offset: 6, kind: "long", km: 22, paceSPerKm: 305, avgHr: 150, name: "Sunday long" },
  ],
  // Week 2, build
  [
    { offset: 1, kind: "easy", km: 10, paceSPerKm: 318, avgHr: 142, name: "Easy" },
    { offset: 2, kind: "workout", km: 13, paceSPerKm: 255, avgHr: 166, name: "6 x 1km at threshold" },
    { offset: 3, kind: "easy", km: 10, paceSPerKm: 320, avgHr: 141, name: "Easy" },
    { offset: 5, kind: "recovery", km: 6, paceSPerKm: 335, avgHr: 135, name: "Recovery" },
    { offset: 6, kind: "long", km: 24, paceSPerKm: 300, avgHr: 151, name: "Sunday long" },
  ],
  // Week 3, the outlier Saturday
  [
    { offset: 1, kind: "easy", km: 11, paceSPerKm: 320, avgHr: 143, name: "Easy" },
    { offset: 2, kind: "workout", km: 14, paceSPerKm: 252, avgHr: 167, name: "3 x 2km at threshold" },
    { offset: 3, kind: "easy", km: 10, paceSPerKm: 322, avgHr: 141, name: "Easy" },
    { offset: 5, kind: "easy", km: 8, paceSPerKm: 298, avgHr: 152, name: "Saturday with the group" },
    { offset: 6, kind: "long", km: 26, paceSPerKm: 302, avgHr: 152, name: "Sunday long" },
  ],
  // Week 4, step-back
  [
    { offset: 1, kind: "easy", km: 8, paceSPerKm: 322, avgHr: 140, name: "Easy" },
    { offset: 2, kind: "workout", km: 10, paceSPerKm: 270, avgHr: 160, name: "Tempo 5km" },
    { offset: 3, kind: "easy", km: 8, paceSPerKm: 325, avgHr: 140, name: "Easy" },
    { offset: 5, kind: "recovery", km: 6, paceSPerKm: 335, avgHr: 135, name: "Recovery" },
    { offset: 6, kind: "long", km: 20, paceSPerKm: 305, avgHr: 149, name: "Cut-back long" },
  ],
  // Week 5, MISSING (illness / travel), only two very short runs
  [
    { offset: 1, kind: "easy", km: 5, paceSPerKm: 340, avgHr: 138, name: "Short shakeout" },
    { offset: 3, kind: "easy", km: 6, paceSPerKm: 338, avgHr: 140, name: "Back to it" },
  ],
  // Week 6, return, ease in
  [
    { offset: 1, kind: "easy", km: 10, paceSPerKm: 322, avgHr: 143, name: "Easy" },
    { offset: 2, kind: "workout", km: 12, paceSPerKm: 262, avgHr: 164, name: "5 x 1km at threshold" },
    { offset: 3, kind: "easy", km: 10, paceSPerKm: 320, avgHr: 141, name: "Easy" },
    { offset: 5, kind: "recovery", km: 6, paceSPerKm: 332, avgHr: 136, name: "Recovery" },
    { offset: 6, kind: "long", km: 24, paceSPerKm: 302, avgHr: 150, name: "Sunday long" },
  ],
  // Week 7, build back
  [
    { offset: 1, kind: "easy", km: 11, paceSPerKm: 318, avgHr: 142, name: "Easy" },
    { offset: 2, kind: "workout", km: 14, paceSPerKm: 256, avgHr: 166, name: "3 x 2km threshold" },
    { offset: 3, kind: "easy", km: 10, paceSPerKm: 320, avgHr: 141, name: "Easy" },
    { offset: 5, kind: "recovery", km: 6, paceSPerKm: 334, avgHr: 136, name: "Recovery" },
    { offset: 6, kind: "long", km: 28, paceSPerKm: 300, avgHr: 152, name: "Sunday long" },
  ],
  // Week 8, peak building, hot long run with HR drift (higher HR than usual)
  [
    { offset: 1, kind: "easy", km: 12, paceSPerKm: 318, avgHr: 143, name: "Easy" },
    { offset: 2, kind: "workout", km: 15, paceSPerKm: 252, avgHr: 168, name: "2 x 3km at MP+threshold" },
    { offset: 3, kind: "easy", km: 10, paceSPerKm: 320, avgHr: 141, name: "Easy" },
    { offset: 5, kind: "recovery", km: 7, paceSPerKm: 334, avgHr: 137, name: "Recovery" },
    { offset: 6, kind: "long", km: 30, paceSPerKm: 305, avgHr: 159, name: "Long, humid" },
  ],
  // Week 9, biggest week
  [
    { offset: 1, kind: "easy", km: 12, paceSPerKm: 318, avgHr: 142, name: "Easy" },
    { offset: 2, kind: "workout", km: 16, paceSPerKm: 248, avgHr: 168, name: "MP block 3 x 4km" },
    { offset: 3, kind: "easy", km: 11, paceSPerKm: 320, avgHr: 141, name: "Easy" },
    { offset: 5, kind: "recovery", km: 7, paceSPerKm: 334, avgHr: 137, name: "Recovery" },
    { offset: 6, kind: "long", km: 32, paceSPerKm: 298, avgHr: 152, name: "Sunday long" },
  ],
  // Week 10, most recent, step back
  [
    { offset: 1, kind: "easy", km: 10, paceSPerKm: 320, avgHr: 142, name: "Easy" },
    { offset: 2, kind: "workout", km: 12, paceSPerKm: 256, avgHr: 165, name: "Threshold 4 x 1.5km" },
    { offset: 3, kind: "easy", km: 10, paceSPerKm: 322, avgHr: 141, name: "Easy" },
    { offset: 5, kind: "recovery", km: 6, paceSPerKm: 334, avgHr: 136, name: "Recovery" },
    { offset: 6, kind: "long", km: 24, paceSPerKm: 300, avgHr: 150, name: "Sunday long" },
  ],
];

export function buildFixtureActivities(now: Date = new Date()): FixtureActivity[] {
  const out: FixtureActivity[] = [];
  // Anchor on the most-recent Sunday so long runs land on Sundays in preview.
  const lastSunday = new Date(now);
  const dow = lastSunday.getDay();
  lastSunday.setDate(lastSunday.getDate() - dow);
  lastSunday.setHours(7, 15, 0, 0);

  let strava_id = 9_000_000_100;

  // Week 10 (most recent) is the last entry; build backwards chronologically.
  WEEKS.forEach((week, wIdx) => {
    // wIdx 0 = week 1 (oldest, 10 weeks back); last = week 10 (most recent)
    const weeksBack = WEEKS.length - 1 - wIdx;
    const weekSundayMs = lastSunday.getTime() - weeksBack * 7 * DAY_MS;

    week.forEach((s) => {
      // offset is Monday=1..Sunday=0. We want to place day relative to that
      // week's Sunday. Monday=Sun-6, Tuesday=Sun-5, ..., Saturday=Sun-1, Sunday=Sun-0.
      const dayOffset = s.offset === 0 ? 0 : -(7 - s.offset);
      const date = new Date(weekSundayMs + dayOffset * DAY_MS);
      // Light variance so things don't look too perfect
      const moving_time_s = Math.round(s.km * s.paceSPerKm);
      out.push({
        strava_id: strava_id++,
        start_date_local: date.toISOString(),
        name: s.name,
        activity_type: "Run",
        distance_m: Math.round(s.km * 1000),
        moving_time_s,
        avg_pace_s_per_km: s.paceSPerKm,
        avg_hr: s.avgHr,
        max_hr: s.avgHr + (s.kind === "workout" ? 18 : 10),
        elevation_gain_m: s.elev ?? Math.round(s.km * 6),
      });
    });
  });

  return out.sort(
    (a, b) =>
      new Date(a.start_date_local).getTime() -
      new Date(b.start_date_local).getTime(),
  );
}
