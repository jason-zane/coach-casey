"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchMessagesAroundDate,
  fetchOlderMessages,
  markThreadViewed,
  refreshThread,
} from "@/app/actions/thread";
import type { Message } from "@/lib/thread/types";
import {
  FailedMessageNote,
  MessageBlock,
  StreamingCaseyBlock,
  ThinkingBlock,
} from "./message";
import { Composer } from "./composer";
import { MenuBar, DesktopControls } from "./menu-bar";
import { CalendarPicker } from "./calendar-picker";
import { SearchSurface } from "./search-surface";

type Props = {
  threadId: string;
  lastViewedAt: string | null;
  initialMessages: Message[];
  initialHasMore: boolean;
  initialOldestLoaded: string | null;
  athleteEmail: string;
};

type ChatEvent =
  | { type: "user_message"; id: string; created_at: string }
  | { type: "text"; value: string }
  | { type: "casey_message"; id: string; created_at: string }
  | { type: "done" }
  | { type: "error"; message: string };

type PendingSend = {
  tempId: string;
  body: string;
};

const NEAR_BOTTOM_PX = 120;
const PULL_THRESHOLD_PX = 64;
const PULL_MAX_PX = 96;
const QUEUE_KEY = "coach-casey:pending-sends:v1";

function formatDayHeader(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(d);
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function readQueue(): PendingSend[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as PendingSend[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: PendingSend[]) {
  if (typeof window === "undefined") return;
  try {
    if (items.length === 0) window.localStorage.removeItem(QUEUE_KEY);
    else window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Quota / private mode — degrade silently; messages still show in thread.
  }
}

export function HomeSurface({
  threadId,
  lastViewedAt,
  initialMessages,
  initialHasMore,
  initialOldestLoaded,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [oldestLoaded, setOldestLoaded] = useState<string | null>(initialOldestLoaded);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showBackToNow, setShowBackToNow] = useState(false);
  const [failedSend, setFailedSend] = useState<PendingSend | null>(null);
  const [caseyAnnouncement, setCaseyAnnouncement] = useState("");
  const [online, setOnline] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pullY, setPullY] = useState(0);
  const [pendingQueued, setPendingQueued] = useState<PendingSend[]>([]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelTopRef = useRef<HTMLDivElement | null>(null);
  const initialScrollDoneRef = useRef(false);
  const firstUnreadIdRef = useRef<string | null>(null);
  const wasNearBottomOnStreamStartRef = useRef(true);
  const pullStartYRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialScrollDoneRef.current) return;
    if (!lastViewedAt) {
      firstUnreadIdRef.current = null;
    } else {
      const first = messages.find(
        (m) => m.kind !== "chat_user" && m.created_at > lastViewedAt,
      );
      firstUnreadIdRef.current = first?.id ?? null;
    }
  }, [messages, lastViewedAt]);

  useEffect(() => {
    if (initialScrollDoneRef.current) return;
    const container = scrollRef.current;
    if (!container) return;

    const firstUnreadId = firstUnreadIdRef.current;
    if (firstUnreadId) {
      const el = container.querySelector(`[data-mid="${firstUnreadId}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: "start", behavior: "auto" });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    } else {
      container.scrollTop = container.scrollHeight;
    }
    initialScrollDoneRef.current = true;

    const id = setTimeout(() => {
      markThreadViewed(threadId).catch(() => {});
    }, 800);
    return () => clearTimeout(id);
  }, [threadId]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    function onScroll() {
      if (!container) return;
      const fromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowBackToNow(fromBottom > 400);
    }
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    const sentinel = sentinelTopRef.current;
    if (!container || !sentinel) return;
    if (!hasMore) return;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !loadingOlder && oldestLoaded) {
            void loadOlder();
          }
        }
      },
      { root: container, rootMargin: "200px 0px 0px 0px" },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingOlder, oldestLoaded]);

  const loadOlder = useCallback(async () => {
    if (!oldestLoaded || loadingOlder || !hasMore) return;
    const container = scrollRef.current;
    const previousScrollHeight = container?.scrollHeight ?? 0;
    const previousScrollTop = container?.scrollTop ?? 0;

    setLoadingOlder(true);
    try {
      const res = await fetchOlderMessages(threadId, oldestLoaded, 14);
      if (res.messages.length > 0) {
        setMessages((prev) => [...res.messages, ...prev]);
        setOldestLoaded(res.oldestLoaded ?? oldestLoaded);
      }
      setHasMore(res.hasMore);

      requestAnimationFrame(() => {
        if (!container) return;
        const delta = container.scrollHeight - previousScrollHeight;
        container.scrollTop = previousScrollTop + delta;
      });
    } finally {
      setLoadingOlder(false);
    }
  }, [oldestLoaded, loadingOlder, hasMore, threadId]);

  const doRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await refreshThread(threadId, 14);
      setMessages((prev) => {
        const map = new Map<string, Message>();
        for (const m of [...prev, ...res.messages]) map.set(m.id, m);
        return [...map.values()].sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        );
      });
      setHasMore(res.hasMore);
      if (res.oldestLoaded) {
        setOldestLoaded((prev) => {
          if (!prev) return res.oldestLoaded;
          return res.oldestLoaded! < prev ? res.oldestLoaded : prev;
        });
      }
    } finally {
      setRefreshing(false);
      setPullY(0);
    }
  }, [threadId, refreshing]);

  const jumpToDate = useCallback(
    async (isoDate: string) => {
      const slice = await fetchMessagesAroundDate(threadId, isoDate);
      if (slice.length === 0) return;
      setMessages((prev) => {
        const map = new Map<string, Message>();
        for (const m of [...prev, ...slice]) map.set(m.id, m);
        return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
      setOldestLoaded((prev) => {
        if (!prev) return slice[0]?.created_at ?? null;
        return slice[0].created_at < prev ? slice[0].created_at : prev;
      });

      requestAnimationFrame(() => {
        const container = scrollRef.current;
        if (!container) return;
        const target = slice.find((m) => dayKey(m.created_at) === isoDate) ?? slice[0];
        const el = container.querySelector(`[data-mid="${target.id}"]`);
        if (el instanceof HTMLElement) {
          el.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      });
    },
    [threadId],
  );

  const scrollToBottom = useCallback((smooth = true) => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  const isNearBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return true;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      NEAR_BOTTOM_PX
    );
  }, []);

  const send = useCallback(
    async (body: string, existingTempId?: string) => {
      if (!existingTempId) setFailedSend(null);
      const tempId = existingTempId ?? `tmp-${crypto.randomUUID()}`;
      const nowIso = new Date().toISOString();

      // Offline path: queue and show in thread with the offline marker.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const queued: PendingSend = { tempId, body };
        setMessages((prev) => {
          if (prev.some((m) => m.id === tempId)) return prev;
          return [
            ...prev,
            {
              id: tempId,
              thread_id: threadId,
              athlete_id: "",
              kind: "chat_user",
              body,
              meta: { queued: true },
              created_at: nowIso,
            },
          ];
        });
        setPendingQueued((prev) => {
          const next = [...prev.filter((p) => p.tempId !== tempId), queued];
          writeQueue(next);
          return next;
        });
        requestAnimationFrame(() => scrollToBottom(false));
        return;
      }

      if (!existingTempId) {
        const optimistic: Message = {
          id: tempId,
          thread_id: threadId,
          athlete_id: "",
          kind: "chat_user",
          body,
          meta: {},
          created_at: nowIso,
        };
        setMessages((prev) => [...prev, optimistic]);
      }
      setThinking(true);
      setStreamText("");
      wasNearBottomOnStreamStartRef.current = isNearBottom();
      requestAnimationFrame(() => scrollToBottom(false));

      let caseyId: string | null = null;
      let caseyCreatedAt: string | null = null;
      let accumulated = "";

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (!res.ok || !res.body) throw new Error(`chat failed: ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleEvent = (ev: ChatEvent) => {
          if (ev.type === "user_message") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempId ? { ...m, id: ev.id, created_at: ev.created_at } : m,
              ),
            );
          } else if (ev.type === "text") {
            accumulated += ev.value;
            setThinking(false);
            setStreamText(accumulated);
            if (wasNearBottomOnStreamStartRef.current && isNearBottom()) {
              scrollToBottom(false);
            }
          } else if (ev.type === "casey_message") {
            caseyId = ev.id;
            caseyCreatedAt = ev.created_at;
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        };

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl = buffer.indexOf("\n");
          while (nl !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line) handleEvent(JSON.parse(line) as ChatEvent);
            nl = buffer.indexOf("\n");
          }
        }
        if (buffer.trim()) handleEvent(JSON.parse(buffer.trim()) as ChatEvent);

        if (caseyId && accumulated) {
          const finalId = caseyId;
          const finalAt = caseyCreatedAt ?? new Date().toISOString();
          const finalText = accumulated;
          setMessages((prev) => [
            ...prev,
            {
              id: finalId,
              thread_id: threadId,
              athlete_id: "",
              kind: "chat_casey",
              body: finalText,
              meta: {},
              created_at: finalAt,
            },
          ]);
          setCaseyAnnouncement(`Coach Casey: ${finalText}`);
        }
      } catch (err) {
        console.error(err);
        setFailedSend({ tempId, body });
      } finally {
        setStreamText(null);
        setThinking(false);
      }
    },
    [threadId, scrollToBottom, isNearBottom],
  );

  const retryFailed = useCallback(() => {
    if (!failedSend) return;
    const { body, tempId } = failedSend;
    // Keep the bubble; send again reusing the temp id so it reconciles cleanly.
    setFailedSend(null);
    void send(body, tempId);
  }, [failedSend, send]);

  // --- Offline detection + queue flush
  useEffect(() => {
    function onlineChanged() {
      setOnline(navigator.onLine);
    }
    setOnline(navigator.onLine);
    setPendingQueued(readQueue());
    window.addEventListener("online", onlineChanged);
    window.addEventListener("offline", onlineChanged);
    return () => {
      window.removeEventListener("online", onlineChanged);
      window.removeEventListener("offline", onlineChanged);
    };
  }, []);

  useEffect(() => {
    if (!online || pendingQueued.length === 0) return;
    // Flush one at a time so Casey can respond between. Gently paced.
    const queue = [...pendingQueued];
    (async () => {
      for (const item of queue) {
        // Remove the optimistic "queued" bubble — send() will re-append via
        // reconciliation.
        setMessages((prev) => prev.filter((m) => m.id !== item.tempId));
        setPendingQueued((prev) => {
          const next = prev.filter((p) => p.tempId !== item.tempId);
          writeQueue(next);
          return next;
        });
        await send(item.body);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // --- Swipe-from-edge gestures + pull-to-refresh
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking: "calendar" | "search" | null = null;

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      const w = window.innerWidth;
      if (startX < 24) tracking = "calendar";
      else if (startX > w - 24) tracking = "search";
      else tracking = null;
    }
    function onTouchMove(e: TouchEvent) {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx)) tracking = null;
    }
    function onTouchEnd(e: TouchEvent) {
      if (!tracking) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      if (tracking === "calendar" && dx > 60) setCalendarOpen(true);
      else if (tracking === "search" && dx < -60) setSearchOpen(true);
      tracking = null;
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    function onTouchStart(e: TouchEvent) {
      if (!container || container.scrollTop > 0) return;
      pullStartYRef.current = e.touches[0].clientY;
    }
    function onTouchMove(e: TouchEvent) {
      if (pullStartYRef.current == null || !container) return;
      if (container.scrollTop > 0) {
        pullStartYRef.current = null;
        setPullY(0);
        return;
      }
      const dy = e.touches[0].clientY - pullStartYRef.current;
      if (dy <= 0) {
        setPullY(0);
        return;
      }
      const damped = Math.min(PULL_MAX_PX, dy * 0.55);
      setPullY(damped);
    }
    function onTouchEnd() {
      if (pullStartYRef.current == null) return;
      const py = pullY;
      pullStartYRef.current = null;
      if (py >= PULL_THRESHOLD_PX) {
        void doRefresh();
      } else {
        setPullY(0);
      }
    }

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: true });
    container.addEventListener("touchend", onTouchEnd);
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
    };
  }, [pullY, doRefresh]);

  // --- Keyboard shortcuts (desktop)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (key === "d") {
        e.preventDefault();
        setCalendarOpen(true);
      } else if (key === "/") {
        e.preventDefault();
        const input = document.getElementById("chat-input");
        if (input instanceof HTMLTextAreaElement) input.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const grouped = useMemo(() => {
    const out: Array<{ day: string; items: Message[] }> = [];
    for (const m of messages) {
      const key = dayKey(m.created_at);
      const last = out[out.length - 1];
      if (last && last.day === key) last.items.push(m);
      else out.push({ day: key, items: [m] });
    }
    return out;
  }, [messages]);

  const firstUnreadId = firstUnreadIdRef.current;

  return (
    <div className="min-h-dvh flex flex-col bg-paper">
      <a
        href="#thread"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:text-ink focus:px-3 focus:py-1.5 focus:rounded focus:border focus:border-rule"
      >
        Skip to thread
      </a>

      <header className="flex items-center justify-between px-5 sm:px-6 py-3 border-b border-rule/50">
        <div className="font-serif text-[18px] tracking-tight text-ink">
          Coach Casey
        </div>
        <DesktopControls
          onOpenCalendar={() => setCalendarOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />
      </header>

      {!online && (
        <div
          role="status"
          aria-live="polite"
          className="px-5 sm:px-6 py-2 bg-ink/5 border-b border-rule/50 font-sans text-[13px] text-ink-muted"
        >
          Offline. I&rsquo;ll catch up when you&rsquo;re back.
        </div>
      )}

      <main id="thread" className="flex-1 min-h-0 relative">
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto"
          style={{ overscrollBehaviorY: "contain" }}
        >
          <div
            aria-hidden
            className="overflow-hidden transition-[height] duration-150 ease-out flex items-center justify-center"
            style={{ height: refreshing ? 40 : pullY }}
          >
            <span
              className={`font-mono text-[10px] uppercase tracking-wider ${
                refreshing
                  ? "text-ink-subtle breath"
                  : pullY >= PULL_THRESHOLD_PX
                    ? "text-accent"
                    : "text-ink-subtle"
              }`}
            >
              {refreshing
                ? "Catching up…"
                : pullY >= PULL_THRESHOLD_PX
                  ? "Release to refresh"
                  : pullY > 8
                    ? "Pull to refresh"
                    : ""}
            </span>
          </div>

          <div ref={sentinelTopRef} />
          {hasMore && (
            <div className="px-5 py-4 text-center font-mono text-[10px] uppercase tracking-wider text-ink-subtle">
              {loadingOlder ? "Loading…" : "Scroll for older"}
            </div>
          )}

          <div className="py-6 space-y-5 sm:space-y-6">
            {grouped.map((g) => (
              <section key={g.day} className="space-y-4">
                <div className="px-5 sm:px-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-rule/60" />
                  <div
                    className="font-mono text-[10px] uppercase tracking-wider text-ink-subtle"
                    suppressHydrationWarning
                  >
                    {formatDayHeader(g.day)}
                  </div>
                  <div className="h-px flex-1 bg-rule/60" />
                </div>
                {g.items.map((m) => {
                  const isQueued = Boolean(
                    (m.meta as { queued?: boolean } | null)?.queued,
                  );
                  return (
                    <div key={m.id} data-mid={m.id}>
                      <MessageBlock
                        message={m}
                        unread={
                          firstUnreadId != null &&
                          lastViewedAt != null &&
                          m.kind !== "chat_user" &&
                          m.created_at > lastViewedAt
                        }
                      />
                      {isQueued && (
                        <div className="px-5 sm:px-6 flex justify-end mt-1">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-subtle">
                            Queued — sends when you&rsquo;re back online
                          </span>
                        </div>
                      )}
                      {failedSend?.tempId === m.id && (
                        <div className="mt-1">
                          <FailedMessageNote onRetry={retryFailed} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            ))}

            {thinking && (
              <div>
                <ThinkingBlock />
              </div>
            )}
            {streamText !== null && streamText.length > 0 && (
              <div>
                <StreamingCaseyBlock text={streamText} />
              </div>
            )}
          </div>

          <div className="h-6" />
        </div>

        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {caseyAnnouncement}
        </div>

        {showBackToNow && !streamText && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            aria-label="Back to now"
            className="absolute right-4 bottom-4 bg-surface border border-rule rounded-full shadow-md h-10 w-10 grid place-items-center text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 6l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

        {showBackToNow && streamText !== null && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="absolute left-1/2 -translate-x-1/2 bottom-4 bg-accent text-accent-ink rounded-full shadow-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider breath"
          >
            Coach Casey is replying — tap to follow
          </button>
        )}
      </main>

      <Composer onSend={send} disabled={streamText !== null || thinking} />
      <MenuBar
        onOpenCalendar={() => setCalendarOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
      />

      <CalendarPicker
        threadId={threadId}
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        onPick={(iso) => {
          void jumpToDate(iso);
        }}
      />
      <SearchSurface
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={(iso) => {
          void jumpToDate(iso);
        }}
      />
    </div>
  );
}
