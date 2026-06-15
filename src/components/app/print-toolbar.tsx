"use client";

import { useRouter } from "next/navigation";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Floating toolbar for printable document pages — hidden when printing. */
export function PrintToolbar() {
  const router = useRouter();
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur">
      <Button
        variant="ghost"
        size="sm"
        nativeButton
        onClick={() => router.back()}
      >
        <X className="size-4" /> Close
      </Button>
      <Button size="sm" nativeButton onClick={() => window.print()}>
        <Printer className="size-4" /> Print / Save as PDF
      </Button>
    </div>
  );
}
