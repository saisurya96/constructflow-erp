import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-[2px] border bg-card text-muted-foreground">
        <FileQuestion className="size-7" />
      </div>
      <div className="space-y-1">
        <h1 className="font-display text-xl font-semibold tracking-tight">Not found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          That record doesn&apos;t exist, was removed, or belongs to another company.
        </p>
      </div>
      <Button render={<Link href="/dashboard" />}>Back to dashboard</Button>
    </div>
  );
}
