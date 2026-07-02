"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AdminAthleteRow } from "@/lib/admin/page-data";
import { TestUserToggle } from "@/app/admin/(console)/_components/test-user-toggle";
import { GenerateWeeklyReviewButton } from "@/app/admin/(console)/_components/generate-weekly-review-button";
import { RegenerateDebriefButton } from "../_components/regenerate-debrief-button";
import { Th, Td, TableShell, Pill, shortDate } from "../_components/ui";

type SortKey = "joined" | "name" | "activity" | "signin";

export function AthletesTable({ athletes }: { athletes: AdminAthleteRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("joined");
  const [testOnly, setTestOnly] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = athletes.filter((a) => {
      if (testOnly && !a.isTestUser) return false;
      if (!q) return true;
      return (
        (a.displayName?.toLowerCase().includes(q) ?? false) ||
        (a.email?.toLowerCase().includes(q) ?? false)
      );
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "name":
          return (a.displayName ?? a.email ?? "").localeCompare(
            b.displayName ?? b.email ?? "",
          );
        case "activity":
          return cmpDateDesc(a.lastActivityAt, b.lastActivityAt);
        case "signin":
          return cmpDateDesc(a.lastSignInAt, b.lastSignInAt);
        case "joined":
        default:
          return cmpDateDesc(a.createdAt, b.createdAt);
      }
    });
    return list;
  }, [athletes, query, sort, testOnly]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name or email…"
          className="w-full max-w-xs rounded-md border border-rule bg-surface px-3 py-2 font-sans text-[13px] text-ink outline-none transition-colors focus:border-accent"
        />
        <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-subtle">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-rule bg-surface px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink outline-none transition-colors hover:border-rule-strong focus:border-accent"
          >
            <option value="joined">Newest</option>
            <option value="name">Name</option>
            <option value="activity">Last activity</option>
            <option value="signin">Last sign-in</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-subtle">
          <input
            type="checkbox"
            checked={testOnly}
            onChange={(e) => setTestOnly(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Test only
        </label>
        <span className="ml-auto font-mono text-[11px] text-ink-subtle">
          {rows.length} / {athletes.length}
        </span>
      </div>

      <TableShell>
        <thead className="bg-surface text-ink-muted">
          <tr>
            <Th>Name / email</Th>
            <Th>Joined</Th>
            <Th>Last sign-in</Th>
            <Th>Strava</Th>
            <Th>Last activity</Th>
            <Th>Last Casey</Th>
            <Th>Last review</Th>
            <Th>Test</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-t border-rule">
              <Td>
                <Link
                  href={`/admin/athletes/${a.id}`}
                  className="text-ink underline-offset-2 hover:underline"
                >
                  {a.displayName ?? "—"}
                </Link>
                <div className="text-ink-subtle">{a.email}</div>
              </Td>
              <Td>{shortDate(a.createdAt)}</Td>
              <Td>{shortDate(a.lastSignInAt)}</Td>
              <Td>
                {a.stravaConnected ? (
                  <Pill tone="good">on</Pill>
                ) : (
                  <span className="text-ink-subtle">—</span>
                )}
              </Td>
              <Td>{shortDate(a.lastActivityAt)}</Td>
              <Td>{shortDate(a.lastCaseyMessageAt)}</Td>
              <Td>
                {a.lastWeeklyReviewWeekStart ?? (
                  <span className="text-ink-subtle">—</span>
                )}
              </Td>
              <Td>
                <TestUserToggle athleteId={a.id} isTestUser={a.isTestUser} />
              </Td>
              <Td>
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/admin/athletes/${a.id}`}
                    className="rounded-md border border-rule px-2 py-1 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle transition-colors hover:border-rule-strong hover:text-ink"
                  >
                    view
                  </Link>
                  <GenerateWeeklyReviewButton athleteId={a.id} />
                  <RegenerateDebriefButton
                    athleteId={a.id}
                    returnTo="/admin/athletes"
                  />
                  <Link
                    href={`/admin/messages/${a.id}`}
                    className="rounded-md border border-rule px-2 py-1 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle transition-colors hover:border-rule-strong hover:text-ink"
                  >
                    message
                  </Link>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableShell>
      {rows.length === 0 && (
        <p className="text-[13px] text-ink-muted">
          {athletes.length === 0
            ? "No athletes yet. They'll appear here once anyone signs up."
            : "No athletes match that filter."}
        </p>
      )}
    </div>
  );
}

function cmpDateDesc(a: string | null, b: string | null): number {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return tb - ta;
}
