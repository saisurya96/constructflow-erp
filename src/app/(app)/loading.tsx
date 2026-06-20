import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared route-segment fallback so navigating to a data-heavy page (project
 * detail, dashboard, costing) shows a Blueprint-styled skeleton instead of a
 * frozen old page while its server queries resolve.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {/* page header */}
      <div className="mb-7 space-y-2.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-72 max-w-[80%]" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {/* stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      {/* content rows */}
      <div className="space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}
