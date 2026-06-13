"use client";

import { useEffect, useRef } from "react";

/* Scroll-reveal observer. Adds .in to any [data-reveal] element when it
 * enters the viewport; pen strokes (SVG paths with pathLength=1) and rises
 * key their transitions off that class. Reduced motion reveals everything
 * immediately. */
export function RevealFx() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll("[data-reveal]"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

/* Phone-build counterpart of KmMeter: a fixed rail along the bottom of the
 * viewport, like a watch readout mid-race. Hidden at desktop widths. */
export function KmRail() {
  const numRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const t = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (numRef.current) numRef.current.textContent = (t * 42.195).toFixed(1);
      if (fillRef.current) fillRef.current.style.width = `${t * 100}%`;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="rd-km-rail" aria-hidden="true">
      <span className="rd-km-rail-label">km</span>
      <span className="rd-km-rail-track">
        <span className="rd-km-rail-fill" ref={fillRef} />
      </span>
      <span className="rd-km-rail-num">
        <span ref={numRef}>0.0</span> / 42.2
      </span>
    </div>
  );
}

/* The memory thread: a pen line from the April note to the August recall.
 * The two cards move with the layout, so the path is computed from their
 * real positions (on mount and resize) rather than hand-authored. */
export function ThreadFx() {
  useEffect(() => {
    const draw = () => {
      const zone = document.querySelector<HTMLElement>(".rd-memory");
      const path = document.querySelector<SVGPathElement>(".rd-thread path");
      const april = document.querySelector<HTMLElement>(".rd-mem-card.is-april");
      const august = document.querySelector<HTMLElement>(".rd-mem-card.is-august");
      if (!zone || !path || !april || !august) return;
      const z = zone.getBoundingClientRect();
      const a = april.getBoundingClientRect();
      const b = august.getBoundingClientRect();
      const sx = a.left - z.left + a.width * 0.72;
      const sy = a.bottom - z.top + 10;
      const ex = b.left - z.left + b.width * 0.3;
      const ey = b.top - z.top - 12;
      const c1x = sx + (ex - sx) * 0.85 + 70;
      const c1y = sy + (ey - sy) * 0.2;
      const c2x = sx + (ex - sx) * 0.1 - 40;
      const c2y = sy + (ey - sy) * 0.85;
      // arrowhead barbs swept back from the tip, along the end tangent
      const ang = Math.atan2(ey - c2y, ex - c2x);
      const barb = (spread: number) =>
        `M ${ex} ${ey} L ${(ex - 13 * Math.cos(ang + spread)).toFixed(1)} ${(ey - 13 * Math.sin(ang + spread)).toFixed(1)}`;
      path.setAttribute(
        "d",
        `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey} ${barb(0.5)} ${barb(-0.5)}`,
      );
    };
    draw();
    // re-measure once fonts settle and on resize
    document.fonts?.ready.then(draw).catch(() => {});
    window.addEventListener("resize", draw, { passive: true });
    return () => window.removeEventListener("resize", draw);
  }, []);
  return null;
}

/* The page is a marathon: scroll progress reads out in kilometres and tops
 * out at 42.2 at the footer. Direct DOM writes from a rAF-throttled scroll
 * handler; no re-renders. */
export function KmMeter() {
  const numRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const t = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      const km = (t * 42.195).toFixed(1);
      if (numRef.current) numRef.current.textContent = km;
      if (barRef.current) barRef.current.style.width = `${t * 100}%`;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
      <span className="rd-km" aria-hidden="true">
        <span className="rd-km-num" ref={numRef}>
          0.0
        </span>
        <span className="rd-km-total">/ 42.2 km</span>
      </span>
      {/* sibling, not child: the pill is absolutely positioned, and the bar
       * must span the full sticky header instead */}
      <span className="rd-km-bar" ref={barRef} aria-hidden="true" />
    </>
  );
}
