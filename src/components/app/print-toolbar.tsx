"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Maps a /print/{type}/{id} doc to its source record's detail route. */
const SOURCE_ROUTE: Record<string, string> = {
  po: "/orders",
  invoice: "/billing",
  rfq: "/rfqs",
};

/** Floating toolbar for printable document pages — hidden when printing. */
export function PrintToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  // Print docs open in a new tab, so router.back() lands nowhere. Derive the
  // source record from the URL (/print/{type}/{id}) and link back to it.
  const parts = (pathname ?? "").split("/").filter(Boolean); // ["print", type, id]
  const backHref =
    parts[0] === "print" && SOURCE_ROUTE[parts[1]] && parts[2]
      ? `${SOURCE_ROUTE[parts[1]]}/${parts[2]}`
      : null;
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur">
      {backHref ? (
        <Button variant="ghost" size="sm" render={<Link href={backHref} />}>
          <X className="size-4" /> Close
        </Button>
      ) : (
        <Button variant="ghost" size="sm" nativeButton onClick={() => router.back()}>
          <X className="size-4" /> Close
        </Button>
      )}
      <Button size="sm" nativeButton onClick={() => window.print()}>
        <Printer className="size-4" /> Print / Save as PDF
      </Button>
    </div>
  );
}
