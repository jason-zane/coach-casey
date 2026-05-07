/**
 * Builds the one-line "memory hero" snapshot rendered at the top of the
 * athlete page. The line is the moat made legible: how long Casey has
 * been with the runner, what's been read, what's being held. Numbers
 * are kept (runners like numbers and the founder wants the data) but
 * the framing is relational, not Strava-style.
 *
 * Style rules baked in:
 *   - Time phrases spelled out ("Eight weeks in", not "8 weeks in")
 *   - Activity counts kept numeric ("23 runs read")
 *   - Niggle counts spelled out under 10 ("two niggles")
 *   - Zero clauses dropped, never shown
 *   - No em-dashes anywhere
 */

export type MemoryHeroInput = {
  joinedAt: string;
  runs: number;
  messages: number;
  niggles: number;
  stravaConnected: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildMemoryHeroLine(input: MemoryHeroInput): string {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(input.joinedAt).getTime()) / DAY_MS),
  );

  if (days === 0) {
    return input.stravaConnected
      ? "Day one. Casey will start reading your runs as they come in."
      : "Day one. Connect Strava when you're ready and the read starts there.";
  }

  const timePhrase = formatTimePhrase(days);
  const parts: string[] = [];

  if (input.runs > 0) {
    parts.push(`${input.runs} ${input.runs === 1 ? "run" : "runs"} read`);
  }
  if (input.messages > 0) {
    parts.push(
      `${input.messages} ${input.messages === 1 ? "message" : "messages"}`,
    );
  }
  if (input.niggles > 0) {
    const word = numberWord(input.niggles);
    parts.push(
      `${word} ${input.niggles === 1 ? "niggle" : "niggles"} still on the radar`,
    );
  }

  if (parts.length === 0) {
    return `${timePhrase}.`;
  }
  return `${timePhrase}. ${parts.join(", ")}.`;
}

function formatTimePhrase(days: number): string {
  if (days === 1) return "One day in";
  if (days < 7) return `${capitalised(numberWord(days))} days in`;
  if (days < 14) return "One week in";
  if (days < 56) {
    const weeks = Math.floor(days / 7);
    return `${capitalised(numberWord(weeks))} weeks in`;
  }
  const months = Math.round(days / 30.44);
  if (months <= 1) return "One month in";
  return `${capitalised(numberWord(months))} months in`;
}

function numberWord(n: number): string {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
  ];
  if (n >= 0 && n < words.length) return words[n];
  return String(n);
}

function capitalised(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
