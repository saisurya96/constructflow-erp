import Link from "next/link";
import { HardHat, ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { LandingChrome, DemoVideo } from "./landing-client";

/* ================================================================== *
 *  THE LIVE PLAN — one thread, drawn once, watched moving.
 *  A construction ERP landing page composed as a stamped drawing set:
 *  warm paper + ink, one hi-vis orange thread, mono drafting furniture,
 *  and authentic product surfaces telling the Marina Heights material
 *  loop end to end.
 * ================================================================== */

const DEMO_SRC = "/constructflow-demo.mp4";
const DEMO_POSTER = "/constructflow-demo-poster.jpg";

/* ----------------------------- atoms ----------------------------- */

function Brand({ className = "", nameClass = "" }: { className?: string; nameClass?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex size-8 items-center justify-center rounded-md bg-brand text-brand-foreground">
        <HardHat className="size-[1.1rem]" strokeWidth={2.25} />
      </span>
      <span className={`font-display text-base font-semibold tracking-tight ${nameClass}`}>
        ConstructFlow
      </span>
    </span>
  );
}

function DimensionLine({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-4 text-muted-foreground ${className}`} aria-hidden>
      <span className="h-2 w-px bg-current opacity-50" />
      <span className="h-px flex-1 bg-border" />
      <span className="eyebrow whitespace-nowrap">{label}</span>
      <span className="h-px flex-1 bg-border" />
      <span className="h-2 w-px bg-current opacity-50" />
    </div>
  );
}

function SheetHeader({
  eyebrow,
  title,
  body,
  dim,
}: {
  eyebrow: string;
  title: React.ReactNode;
  body: string;
  dim?: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <span className="eyebrow text-brand-strong">{eyebrow}</span>
      </div>
      <h2 className="mt-5 font-display text-[2rem] font-semibold leading-[1.05] tracking-tight sm:text-[2.6rem]">
        {title}
      </h2>
      <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
        {body}
      </p>
      {dim && <DimensionLine label={dim} className="mt-8" />}
    </div>
  );
}

function StatusMark({ tone }: { tone: "critical" | "good" | "warning" | "brand" | "muted" }) {
  const map: Record<string, string> = {
    critical: "bg-critical",
    good: "bg-good",
    warning: "bg-warning",
    brand: "bg-brand",
    muted: "bg-muted-foreground",
  };
  return <span className={`size-2.5 shrink-0 rounded-[2px] ${map[tone]}`} />;
}

/* --------------------------- mockups ----------------------------- */

/* Hero: a live board surface, the blocked task where the thread is born. */
function ProductSurface() {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-border bg-card text-foreground">
      {/* faux app header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex size-6 items-center justify-center rounded bg-brand text-brand-foreground">
            <HardHat className="size-3.5" strokeWidth={2.25} />
          </span>
          <div>
            <div className="text-[13px] font-semibold leading-none">Marina Heights Tower</div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              PRJ-001 · Board · 38% complete
            </div>
          </div>
        </div>
        <span className="rounded-[4px] bg-muted px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          7 tasks
        </span>
      </div>
      {/* blocked banner */}
      <div className="flex items-center gap-2.5 border-b border-critical/20 bg-critical/[0.06] px-5 py-2.5">
        <StatusMark tone="critical" />
        <span className="text-[12px] font-medium text-critical">1 task blocked by material shortage</span>
      </div>
      {/* mini kanban */}
      <div className="grid grid-cols-3 gap-2.5 p-4 sm:gap-3">
        {/* in progress */}
        <div className="min-w-0">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">In progress</span>
            <span className="rounded bg-muted px-1.5 text-[10px] font-semibold">2</span>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="relative pl-2">
              <span className="absolute -left-1 top-0 h-full w-1 rounded-sm bg-warning" />
              <div className="truncate text-[12px] font-semibold leading-tight">Raft foundation &amp; pile caps</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="flex size-4 items-center justify-center rounded-full bg-foreground text-[8px] font-semibold text-background">RK</span>
                <span className="font-mono text-[9px] text-muted-foreground">Jun 28</span>
              </div>
            </div>
          </div>
        </div>
        {/* blocked — the hero card */}
        <div className="min-w-0">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Blocked</span>
            <span className="rounded bg-critical/15 px-1.5 text-[10px] font-semibold text-critical">1</span>
          </div>
          <div className="relative rounded-md border-2 border-critical bg-card p-3">
            <span className="absolute left-0 top-0 h-full w-1 rounded-l-sm bg-critical" />
            <div className="pl-1.5">
              <div className="text-[12px] font-semibold leading-tight">Basement RC slab pour</div>
              {/* the shortage chip — origin of the thread */}
              <div className="relative mt-2 inline-flex items-center gap-1.5 rounded-[4px] border border-brand/40 bg-brand-muted px-2 py-1">
                <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-brand ring-2 ring-card" />
                <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-[#a8500f]">
                  Shortage · Ready-mix C40
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="flex size-4 items-center justify-center rounded-full bg-foreground text-[8px] font-semibold text-background">RK</span>
                <span className="font-mono text-[9px] text-muted-foreground">Jul 13</span>
              </div>
            </div>
          </div>
        </div>
        {/* done */}
        <div className="min-w-0">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Done</span>
            <span className="rounded bg-muted px-1.5 text-[10px] font-semibold">2</span>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="relative pl-2">
              <span className="absolute -left-1 top-0 h-full w-1 rounded-sm bg-good" />
              <div className="truncate text-[12px] font-semibold leading-tight">Site mobilisation &amp; setup</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="flex size-4 items-center justify-center rounded-full bg-foreground text-[8px] font-semibold text-background">RK</span>
                <span className="font-mono text-[9px] text-muted-foreground">Mar 10</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Source: the RFQ line-by-line compare card. */
function RfqCompareCard() {
  const vendors = [
    { name: "Gulf Ready-Mix", sub: "Concrete & aggregates", total: "£201,600", unit: "£168", lead: "7d", comp: "94%", won: true },
    { name: "Al Manara", sub: "Readymix supplier", total: "£208,400", unit: "£174", lead: "9d", comp: "88%", won: false },
    { name: "Pioneer Readymix", sub: "Concrete & aggregates", total: "£214,900", unit: "£179", lead: "14d", comp: "82%", won: false },
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="eyebrow text-muted-foreground">Compare · line by line</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">RFQ-0002</span>
      </div>
      <div className="border-b border-border px-5 py-3">
        <div className="text-[13px] font-semibold">Ready-mix concrete C40 · 1,200 m³</div>
        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Raised on “Basement RC slab pour”
        </div>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            <th className="px-5 py-2.5 font-medium">Vendor</th>
            <th className="px-3 py-2.5 text-right font-medium">Total</th>
            <th className="px-3 py-2.5 text-right font-medium">Unit</th>
            <th className="px-3 py-2.5 text-right font-medium">Lead</th>
            <th className="px-5 py-2.5 text-right font-medium">Comp.</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr
              key={v.name}
              className={`border-b border-border last:border-0 ${v.won ? "bg-brand-muted" : ""}`}
            >
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  {v.won && <Check className="size-3.5 text-brand" strokeWidth={3} />}
                  <span className={`text-[13px] font-semibold ${v.won ? "text-[#a8500f]" : ""}`}>{v.name}</span>
                </div>
                <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">{v.sub}</div>
              </td>
              <td className={`px-3 py-3 text-right text-[13px] font-semibold tabular ${v.won ? "text-[#a8500f]" : ""}`}>{v.total}</td>
              <td className="px-3 py-3 text-right text-[13px] tabular text-muted-foreground">{v.unit}</td>
              <td className="px-3 py-3 text-right text-[13px] tabular text-muted-foreground">{v.lead}</td>
              <td className="px-5 py-3 text-right text-[13px] tabular text-muted-foreground">{v.comp}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2.5 border-t border-good/25 bg-good/[0.08] px-5 py-3">
        <Check className="size-4 text-good" strokeWidth={3} />
        <span className="text-[12px] font-medium text-good">Awarded — purchase order PO-0002 created</span>
      </div>
    </div>
  );
}

/* Gate→Cost: the flipped task + the costing strip wired together. */
function GateCostStack() {
  return (
    <div className="relative">
      {/* the now-unblocked task */}
      <div className="relative z-10 rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            The blocked task, now
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-good">
            <Check className="size-3" strokeWidth={3} /> GRN-0007 posted
          </span>
        </div>
        <div className="relative rounded-md border border-border bg-card p-3.5">
          <span className="absolute left-0 top-0 h-full w-1 rounded-l-sm bg-warning" />
          <div className="pl-1.5">
            <div className="text-[13px] font-semibold">Basement RC slab pour</div>
            <div className="mt-2 flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-[4px] bg-warning/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-warning-foreground">
                <StatusMark tone="warning" /> In progress
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">Resumes Jul 13</span>
            </div>
          </div>
        </div>
      </div>

      {/* orange wire connecting cause → effect */}
      <div aria-hidden className="ml-8 flex flex-col items-start">
        <span className="h-7 w-px bg-brand" />
        <span className="-mt-1 ml-[-3px] size-2 rounded-full border-2 border-brand bg-background" />
      </div>

      {/* costing strip */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="eyebrow text-muted-foreground">Job costing · live</span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-good">
            <StatusMark tone="good" /> On budget
          </span>
        </div>
        <div className="grid grid-cols-4 divide-x divide-border">
          {[
            { k: "Budget", v: "£12M", o: false },
            { k: "Committed", v: "£0.42M", o: false },
            { k: "Actual", v: "£0.58M", o: false },
            { k: "Forecast", v: "£12M", o: true },
          ].map((s) => (
            <div key={s.k} className="px-3 first:pl-0 last:pr-0">
              <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{s.k}</div>
              <div className={`mt-1.5 font-display text-2xl font-semibold tabular ${s.o ? "text-brand" : ""}`}>{s.v}</div>
            </div>
          ))}
        </div>
        {/* variance meter */}
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            <span>Forecast vs budget</span>
            <span className="text-good">£0 variance · margin £2.5M</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-[2px] bg-muted">
            <div className="h-full w-full rounded-[2px] bg-good" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- data tables --------------------------- */

const SYSTEMS: { tag: string; system: string; does: string; feeds: string; keystone?: boolean }[] = [
  { tag: "01", system: "Projects & schedule", does: "Board, table and timeline over one budget", feeds: "→ Cost" },
  { tag: "02", system: "The material loop", does: "A need on a task → procurement → gate → stock", feeds: "→ Everything", keystone: true },
  { tag: "03", system: "Procurement & quotes", does: "Invite vendors, compare quotes, release purchase orders", feeds: "→ Cost" },
  { tag: "04", system: "Job costing", does: "Budget vs committed vs actual vs forecast", feeds: "→ Billing" },
  { tag: "05", system: "Billing & payments", does: "Progress invoices, payments, approvals inbox", feeds: "→ Books" },
  { tag: "06", system: "Full audit trail", does: "Every action logged, exportable, attributable", feeds: "→ Compliance" },
];

const ROLES: { n: string; role: string; gets: string; truth: string }[] = [
  { n: "01", role: "Owner", gets: "Every job’s margin, plus an approvals inbox", truth: "margin £2.5M" },
  { n: "02", role: "Project manager", gets: "The board, the blockers, the budget line", truth: "pour unblocked" },
  { n: "03", role: "Procurement", gets: "Requirements queued, quotes compared, purchase orders released", truth: "PO-0002 released" },
  { n: "04", role: "Stores", gets: "Receive at the gate; stock and allocations stay honest", truth: "C40 in stock" },
  { n: "05", role: "Finance", gets: "Invoices, payments and cost — reconciled, not re-keyed", truth: "£201.6K committed" },
];

const ROLE_CHIPS: { role: string; truth: string; offset: string }[] = [
  { role: "Owner", truth: "margin £2.5M", offset: "lg:mt-0" },
  { role: "PM", truth: "pour unblocked", offset: "lg:mt-10" },
  { role: "Procurement", truth: "PO-0002 released", offset: "lg:mt-3" },
  { role: "Stores", truth: "C40 in stock", offset: "lg:mt-14" },
  { role: "Finance", truth: "£201.6K committed", offset: "lg:mt-6" },
];

/* =============================== PAGE ============================= */

export function LandingPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <LandingChrome />

      {/* ─────────────────────────── nav ─────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-4">
            <Brand />
            <span className="hidden items-center gap-1.5 border-l border-border pl-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground md:flex">
              <span className="size-1.5 rounded-[1px] bg-brand" />
              Construction ERP
            </span>
          </div>
          <nav className="hidden items-center gap-6 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground lg:flex">
            <a href="#film" className="transition-colors hover:text-foreground">Demo</a>
            <a href="#source" className="transition-colors hover:text-foreground">Sourcing</a>
            <a href="#systems" className="transition-colors hover:text-foreground">Systems</a>
            <a href="#roles" className="transition-colors hover:text-foreground">Roles</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted sm:inline-flex">
              Sign in
            </Link>
            <Link href="/signup" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90">
              Start free <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ───────────────────────── hero (cover) ───────────────────────── */}
        <section id="cover" className="relative overflow-hidden bg-foreground text-background">
          <div aria-hidden className="blueprint-grid pointer-events-none absolute inset-0 text-background/[0.06]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-12 lg:gap-8 lg:px-8 lg:py-28">
            {/* left: the pitch */}
            <div className="lg:col-span-5">
              <span className="eyebrow inline-flex items-center gap-2 text-background/60">
                <span className="size-1.5 rounded-[1px] bg-brand" />
                Now live — Marina Heights Tower · £14.5M
              </span>
              <h1 className="mt-6 font-display text-[2.75rem] font-semibold leading-[1.02] tracking-tight sm:text-[3.5rem]">
                Pull one <span className="text-brand">thread.</span> The whole job moves.
              </h1>
              <p className="mt-6 max-w-md text-[1.0625rem] leading-relaxed text-background/65">
                A shortage on a task becomes a quote, a purchase order, a delivery and a cost line — without
                anyone re-typing a thing. The first ERP a construction team actually wants to use.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-6 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90">
                  Start free <ArrowRight className="size-4" />
                </Link>
                <a href="#film" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-background/20 px-6 text-sm font-medium text-background transition-colors hover:bg-background/10">
                  Watch the 30s loop
                </a>
              </div>
            </div>
            {/* right: the live product surface, bleeding right */}
            <div className="lg:col-span-7 lg:-mr-16 xl:-mr-28">
              <ProductSurface />
            </div>
          </div>
        </section>

        {/* ───────────────────────── demo film ───────────────────────── */}
        <section id="film" className="relative overflow-hidden border-b border-border bg-background">
          <div aria-hidden className="blueprint-grid pointer-events-none absolute inset-0 text-foreground/[0.035]" />
          <div className="relative mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
              {/* left margin: chapter index */}
              <div className="lg:col-span-3">
                <span className="eyebrow text-brand-strong">The material loop</span>
                <h2 className="mt-4 font-display text-[1.9rem] font-semibold leading-tight tracking-tight">
                  Watch the demo
                </h2>
                <ul className="mt-7 space-y-2.5 border-t border-border pt-5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  {[
                    ["00:04", "Plan & raise"],
                    ["00:09", "Compare & award"],
                    ["00:15", "Receive at the gate"],
                    ["00:20", "Cost & bill"],
                  ].map(([t, l]) => (
                    <li key={t} className="flex items-center gap-3">
                      <span className="text-brand-strong tabular">{t}</span>
                      <span className="h-px flex-1 bg-border" />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* the recessed bezel */}
              <div className="lg:col-span-9">
                <div className="relative rounded-xl border border-border bg-card p-3 sm:p-4">
                  <div className="mb-3 flex items-center px-1">
                    <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      <span className="size-2 rounded-[1px] bg-critical" /> REC
                    </span>
                  </div>
                  <DemoVideo src={DEMO_SRC} poster={DEMO_POSTER} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────── source figure (thread-walk) ─────────────── */}
        <section id="source" className="relative border-b border-border bg-background">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-28">
            <SheetHeader
              eyebrow="Sourcing"
              title={<>Three quotes, one honest comparison.</>}
              body="The shortage isn’t a memo — it’s a requirement on the task that pours the slab. Three vendors, one screen. The cheapest line is already lit."
              dim="3 vendors · 1 screen"
            />
            <div className="mt-12 grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
              <div className="lg:col-span-7">
                <RfqCompareCard />
              </div>
              <ul className="space-y-6 lg:col-span-5 lg:pl-6">
                {[
                  ["Cheapest, flagged automatically", "The lowest compliant line lights orange — no spreadsheet math."],
                  ["Lead time & compliance on one row", "Price isn’t the only axis. See the trade-off before you commit."],
                  ["Award → purchase order in one click", "The winner becomes a purchase order, routed for approval instantly."],
                ].map(([h, b]) => (
                  <li key={h} className="border-l-2 border-border pl-5">
                    <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-foreground">
                      <ArrowRight className="size-3.5 text-brand" /> {h}
                    </div>
                    <p className="mt-1.5 text-[0.95rem] leading-relaxed text-muted-foreground">{b}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ─────────────── gate → cost figure (thread-walk) ─────────────── */}
        <section id="gate" className="relative border-b border-border bg-background">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
              {/* left: the claim */}
              <div className="lg:col-span-5">
                <SheetHeader
                  eyebrow="Delivery → cost"
                  title={<>Book the delivery once. Stock, cost and the schedule all move.</>}
                  body="The blocked pour flips to In Progress the moment the concrete is received. Nobody re-typed a thing. Forecast £12M — on budget."
                />
                <ul className="mt-8 space-y-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  {["Receiving at the gate raises stock", "The blocked task unblocks itself", "Actual cost posts against budget"].map((l) => (
                    <li key={l} className="flex items-center gap-2.5">
                      <span className="size-1.5 rounded-[1px] bg-brand" /> {l}
                    </li>
                  ))}
                </ul>
              </div>
              {/* right: the wired surfaces */}
              <div className="lg:col-span-7">
                <GateCostStack />
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────── seam-proof: enter once (ink) ─────────────── */}
        <section id="seam" className="relative overflow-hidden bg-foreground text-background">
          <div aria-hidden className="blueprint-grid pointer-events-none absolute inset-0 text-background/[0.05]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 lg:grid-cols-2 lg:px-8 lg:py-28">
            <div>
              <span className="eyebrow text-brand">One entry, five truths</span>
              <h2 className="mt-5 font-display text-[2.4rem] font-semibold leading-[1.05] tracking-tight sm:text-[3rem]">
                <span className="text-brand">Enter it once</span> on Monday.
                <br />
                Everyone reads it by Tuesday.
              </h2>
              <p className="mt-6 max-w-md text-[1.0625rem] leading-relaxed text-background/60">
                The crew, the buyer, the stores and the books all read the same figures — no re-typing, no
                chasing, no version that’s already wrong.
              </p>
              <div className="mt-8 inline-flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-background/60">
                <span className="inline-flex items-center gap-2 text-brand"><span className="size-2 rounded-[1px] bg-brand" /> Mon</span>
                <span className="h-px w-10 bg-background/25" />
                <span className="inline-flex items-center gap-2"><span className="size-2 rounded-[1px] bg-background/30" /> Tue</span>
              </div>
            </div>
            {/* the thread forks into five role chips, diagonally staggered */}
            <div className="grid grid-cols-2 gap-4 sm:gap-5">
              {ROLE_CHIPS.map((c) => (
                <div
                  key={c.role}
                  className={`rounded-lg border border-background/15 bg-background/[0.04] p-4 ${c.offset}`}
                >
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-background/60">{c.role}</div>
                  <div className="mt-2 flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
                    <span className="size-1.5 rounded-[1px] bg-brand" />
                    {c.truth}
                  </div>
                </div>
              ))}
              <div className="flex items-center rounded-lg border border-dashed border-background/15 p-4 text-[13px] leading-relaxed text-background/65">
                One entry → five roles, already reconciled.
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────── schedule of systems (table) ─────────────── */}
        <section id="systems" className="relative border-b border-border bg-background">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-28">
            <SheetHeader
              eyebrow="Six core systems"
              title={<>Everything the job needs, on one ledger.</>}
              body="Six systems, one source of truth. The material loop is the spine; everything feeds it."
              dim="6 systems · 1 ledger"
            />
            <div className="mt-12 overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse">
                <thead>
                  <tr className="border-y border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="py-3 pr-4 text-left font-medium">#</th>
                    <th className="py-3 pr-4 text-left font-medium">System</th>
                    <th className="py-3 pr-4 text-left font-medium">What it does</th>
                    <th className="py-3 pr-4 text-left font-medium">Feeds</th>
                    <th className="py-3 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {SYSTEMS.map((s, i) => (
                    <tr
                      key={s.tag}
                      className={`group border-b border-border ${i % 2 ? "bg-muted/30" : ""} transition-colors hover:bg-muted/60`}
                    >
                      <td className="relative py-4 pr-4">
                        {s.keystone && <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r bg-brand transition-all group-hover:h-9" />}
                        <span className="font-mono text-[12px] tabular text-muted-foreground">{s.tag}</span>
                      </td>
                      <td className="py-4 pr-4">
                        <span className={`font-display text-[15px] font-semibold ${s.keystone ? "text-brand-strong" : ""}`}>{s.system}</span>
                      </td>
                      <td className="py-4 pr-4 text-[14px] text-muted-foreground">{s.does}</td>
                      <td className="py-4 pr-4">
                        <span className="inline-flex rounded-[4px] border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                          {s.feeds}
                        </span>
                      </td>
                      <td className="py-4 text-right">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-good">
                          <StatusMark tone="good" /> Live
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ─────────────── roles index (ledger) ─────────────── */}
        <section id="roles" className="relative border-b border-border bg-background">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-28">
            <SheetHeader
              eyebrow="Built for your team"
              title={<>Every role. One source of truth.</>}
              body="Role-based access — each person sees their own work and the very same numbers."
            />
            <ul className="mt-12 border-t border-border">
              {ROLES.map((r) => (
                <li
                  key={r.role}
                  className="group grid grid-cols-1 items-baseline gap-1 border-b border-border py-5 transition-colors hover:bg-muted/40 sm:grid-cols-[auto_1fr_auto] sm:gap-6"
                >
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-[12px] tabular text-brand-strong">{r.n}</span>
                    <span className="w-44 font-display text-lg font-semibold tracking-tight">{r.role}</span>
                  </div>
                  <span className="hidden text-[15px] text-muted-foreground sm:block">{r.gets}</span>
                  <span className="text-[15px] text-muted-foreground sm:hidden">{r.gets}</span>
                  <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]">
                    <span className="size-1.5 rounded-[1px] bg-brand" />
                    <span className="text-foreground">{r.truth}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ─────────────── cta: issued for construction ─────────────── */}
        <section id="start" className="relative overflow-hidden bg-background">
          <div aria-hidden className="blueprint-grid pointer-events-none absolute inset-0 text-foreground/[0.035]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 lg:grid-cols-2 lg:px-8 lg:py-32">
            <div className="order-2 lg:order-1">
              <div className="inline-block rotate-[-2deg] rounded-md border-2 border-brand/70 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-brand-strong">
                Ready when you are
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <span className="eyebrow text-brand-strong">Get started</span>
              <h2 className="mt-4 font-display text-[2.2rem] font-semibold leading-[1.05] tracking-tight sm:text-[2.75rem]">
                Switch your next job onto the panel.
              </h2>
              <p className="mt-4 max-w-md text-[1.0625rem] leading-relaxed text-muted-foreground">
                Spin up a workspace in minutes. No card. Built for firms running on spreadsheets, WhatsApp and paper.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className="group inline-flex h-12 items-center justify-center gap-2.5 rounded-lg bg-brand px-7 text-sm font-medium text-brand-foreground transition-all hover:bg-brand/90 active:scale-[0.98]">
                  <span className="size-2 rounded-full bg-brand-foreground/70 transition-colors group-hover:bg-brand-foreground" />
                  Start free <ArrowRight className="size-4" />
                </Link>
                <Link href="/login" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-7 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                  Sign in
                </Link>
              </div>
              <DimensionLine label="Set up in minutes" className="mt-9 max-w-sm" />
            </div>
          </div>
        </section>
      </main>

      {/* ─────────────── title-block footer ─────────────── */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="grid grid-cols-2 border-x border-border md:grid-cols-4">
            <FooterCell k="Product" v="ConstructFlow" />
            <FooterCell k="Category" v="Construction ERP" />
            <FooterCell k="Status" v="Live" />
            <FooterCell k="Year" v="2026" />
          </div>
          <div className="flex flex-col items-center justify-between gap-4 border-x border-b border-border px-5 py-6 sm:flex-row">
            <Brand />
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <ArrowUpRight className="size-3.5 text-brand" />
              Built for builders
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              ConstructFlow — construction ERP
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="border-b border-l border-border px-4 py-4 first:border-l-0 md:border-b-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{k}</div>
      <div className="mt-1 font-mono text-[12px] tracking-wide text-foreground tabular">{v}</div>
    </div>
  );
}
