import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/app/eyebrow";

export function SectionCard({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  noPadding,
}: {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  noPadding?: boolean;
}) {
  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      {(title || actions || eyebrow) && (
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            {eyebrow && <Eyebrow className="mb-1 block">{eyebrow}</Eyebrow>}
            {title && (
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </header>
      )}
      <div className={cn(!noPadding && "p-4", contentClassName)}>{children}</div>
    </section>
  );
}
