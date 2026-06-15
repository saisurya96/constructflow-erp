import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed bg-card/40 px-6 py-12 text-center",
        className,
      )}
    >
      {/* faint engineering grid — drafting-paper texture */}
      <div
        aria-hidden
        className="blueprint-grid pointer-events-none absolute inset-0 text-border opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
      />
      {icon && (
        <div className="relative mb-3 flex size-11 items-center justify-center rounded-md border bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <p className="relative text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="relative mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="relative mt-4">{action}</div>}
    </div>
  );
}
