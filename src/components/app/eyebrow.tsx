import { cn } from "@/lib/utils";

/**
 * Mono uppercase micro-label — the pervasive "drafting annotation" device of
 * the Blueprint UI. Use above section titles, KPIs and page headers.
 */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("eyebrow text-muted-foreground", className)}>
      {children}
    </span>
  );
}
