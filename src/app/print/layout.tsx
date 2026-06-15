import { requireUser } from "@/lib/auth/context";
import { PrintToolbar } from "@/components/app/print-toolbar";

/**
 * Minimal chrome for printable documents — no app shell, so "Save as PDF"
 * produces a clean sheet. Auth is still enforced; per-document capability
 * checks live in each page.
 */
export default async function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <div className="min-h-screen bg-muted/40">
      <PrintToolbar />
      <div className="px-4 pb-12">{children}</div>
    </div>
  );
}
