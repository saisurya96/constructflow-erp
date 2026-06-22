"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

/* ------------------------------------------------------------------ *
 * The drawing-sheet chrome: a top scroll-progress hairline, a left
 * margin-rail "Thread" whose active folio lights orange, and a fixed
 * title block whose value cell tracks the section in view. One tiny
 * IntersectionObserver + one rAF scroll handler — purely cosmetic,
 * degrades to a correct static state and honours reduced-motion.
 * ------------------------------------------------------------------ */

type Folio = { id: string; n: string; label: string };

const FOLIOS: Folio[] = [
  { id: "cover", n: "00", label: "Overview" },
  { id: "film", n: "01", label: "Demo" },
  { id: "source", n: "02", label: "Sourcing" },
  { id: "gate", n: "03", label: "Delivery" },
  { id: "seam", n: "04", label: "One entry" },
  { id: "systems", n: "05", label: "Systems" },
  { id: "roles", n: "06", label: "Roles" },
  { id: "start", n: "07", label: "Get started" },
];

export function LandingChrome() {
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        setProgress(max > 0 ? Math.min(1, h.scrollTop / max) : 0);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const i = FOLIOS.findIndex((f) => f.id === e.target.id);
            if (i >= 0) setActive(i);
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    FOLIOS.forEach((f) => {
      const el = document.getElementById(f.id);
      if (el) io.observe(el);
    });

    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const current = FOLIOS[active] ?? FOLIOS[0];

  return (
    <>
      {/* left margin rail — the Thread + folio index (lg+) */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-40 hidden h-screen w-[112px] min-[1440px]:flex"
      >
        <div className="relative ml-12 mt-0 flex h-full flex-col justify-center">
          {/* faint full rail */}
          <div className="absolute left-[5px] top-[12%] h-[76%] w-px bg-border" />
          {/* drawn thread */}
          <div
            className="absolute left-[5px] top-[12%] w-px origin-top bg-brand"
            style={{ height: `${76 * progress}%` }}
          />
          <ul className="relative space-y-7">
            {FOLIOS.map((f, i) => {
              const on = i === active;
              return (
                <li key={f.id} className="flex items-center gap-3.5">
                  <span
                    className={`size-[11px] shrink-0 rounded-[2px] border transition-colors duration-300 ${
                      on
                        ? "border-brand bg-brand"
                        : i < active
                          ? "border-brand/50 bg-brand/30"
                          : "border-border bg-background"
                    }`}
                  />
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.16em] transition-colors duration-300 ${
                      on ? "text-foreground" : "text-muted-foreground/60"
                    }`}
                  >
                    <span className={on ? "text-brand" : ""}>{f.n}</span> {f.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* fixed title block, lower-right (lg+) */}
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-6 right-6 z-40 hidden grid-cols-2 overflow-hidden rounded-[4px] border border-foreground/15 bg-background/85 backdrop-blur min-[1680px]:grid"
      >
        <TBCell k="Product" v="ConstructFlow" />
        <TBCell k="Section" v={current.label} accent />
        <TBCell k="Status" v="Live" />
        <TBCell k="Year" v="2026" />
      </div>
    </>
  );
}

function TBCell({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="border-b border-l border-foreground/10 px-3.5 py-2 first:border-l-0 [&:nth-child(2)]:border-l [&:nth-child(3)]:border-b-0 [&:nth-child(4)]:border-b-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
        {k}
      </div>
      <div
        className={`mt-0.5 font-mono text-[12px] tracking-wide tabular-nums ${
          accent ? "text-brand" : "text-foreground"
        }`}
      >
        {v}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The demo film. Autoplays muted/looped (premium "alive" feel) but
 * respects reduced-motion (poster + manual play), with a squared
 * brand-orange play/pause control — never a round glassy button.
 * ------------------------------------------------------------------ */

function fmt(s: number) {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function DemoVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const syncDur = () => {
      if (Number.isFinite(v.duration)) setDur(v.duration);
    };
    syncDur(); // metadata may already be loaded before this effect runs
    v.addEventListener("loadedmetadata", syncDur);
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) v.play().catch(() => {});
    return () => v.removeEventListener("loadedmetadata", syncDur);
  }, []);

  // `playing` is driven by the element's own play/pause events (single source
  // of truth), so OS/tab-level pauses keep the control in sync.
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const pct = dur > 0 ? Math.min(1, cur / dur) : 0;

  return (
    <div className="space-y-3">
      <div className="group relative aspect-video w-full overflow-hidden rounded-[5px] bg-foreground">
        <video
          ref={ref}
          className="size-full object-cover"
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            setCur(e.currentTarget.currentTime);
            if (Number.isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration);
          }}
        />
        {/* squared play/pause control */}
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause demo" : "Play demo"}
          className={`absolute inset-0 flex items-center justify-center transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            playing ? "opacity-0 group-hover:opacity-100" : "opacity-100"
          }`}
        >
          <span className="flex size-16 items-center justify-center rounded-[6px] bg-brand text-brand-foreground ring-1 ring-foreground/10 transition-transform active:scale-95">
            {playing ? (
              <Pause className="size-6" fill="currentColor" strokeWidth={0} />
            ) : (
              <Play className="ml-0.5 size-6" fill="currentColor" strokeWidth={0} />
            )}
          </span>
        </button>
      </div>

      {/* live progress tracker */}
      <div className="flex items-center gap-3 px-1">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-200 ease-linear"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {fmt(cur)} / {fmt(dur)}
        </span>
      </div>
    </div>
  );
}
