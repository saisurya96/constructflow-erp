"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for the server logs / observability when wired up in the cloud.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-[2px] border border-critical/30 bg-critical/5 text-critical">
        <AlertTriangle className="size-7" />
      </div>
      <div className="space-y-1">
        <h1 className="font-display text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          An unexpected error interrupted this page. You can try again or head back to your dashboard.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button nativeButton onClick={() => reset()}>
          Try again
        </Button>
        <Button variant="outline" render={<Link href="/dashboard" />}>
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
