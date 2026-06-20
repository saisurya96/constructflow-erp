"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

/* ------------------------------------------------------------------ *
 * The drawing-sheet chrome: a top scroll-progress hairline, a left
 * margin-rail "Thread" whose active folio lights orange, and a fixed
 * title block whose SHEET cell tracks the section in view. One tiny
 * IntersectionObserver + one rAF scroll handler — purely cosmetic,
 * degrades to a correct static state and honours reduced-motion.
 * ------------------------------------------------------------------ */

type Folio = { id: string; n: string; label: string; sheet: string };

const FOLIOS: Folio[] = [
  { id: "cover", n: "00", label: "Cover", sheet: "A-101" },
  { id: "film", n: "01", label: "The film", sheet: "A-102" },
  { id: "source", n: "02", label: "Source", sheet: "A-104" },
  { id: "gate", n: "03", label: "Gate → cost", sheet: "A-105" },
  { id: "seam", n: "04", label: "One entry", sheet: "A-106" },
  { id: "systems", n: "05", label: "Systems", sheet: "A-107" },
  { id: "roles", n: "06", label: "Roles", sheet: "A-108" },
  { id: "start", n: "07", label: "Power on", sheet: "A-109" },
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
      {/* top scroll-progress hairline */}
      <div
        aria-hidden
        className="fixed inset-x-0 top-0 z-[70] h-[3px] bg-transparent"
      >
        <div
          className="h-full origin-left bg-brand"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

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
        <TBCell k="Project" v="ConstructFlow" />
        <TBCell k="Sheet" v={current.sheet} accent />
        <TBCell k="Scale" v="N.T.S." />
        <TBCell k="Rev" v="A" />
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

export function DemoVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) v.play().catch(() => {});
  }, []);

  // `playing` is driven by the element's own play/pause events (single source
  // of truth), so OS/tab-level pauses keep the control in sync.
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  return (
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
  );
}
