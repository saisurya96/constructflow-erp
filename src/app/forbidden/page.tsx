import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-[2px] border border-critical/30 bg-critical/5 text-critical">
        <ShieldX className="size-7" strokeWidth={1.75} />
      </div>
      <div className="space-y-2">
        <span className="eyebrow block text-muted-foreground">Access denied</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          You don&apos;t have access here
        </h1>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Your role doesn&apos;t have access to this area. If you think this is a
          mistake, ask your administrator to adjust your access.
        </p>
      </div>
      <Button render={<Link href="/dashboard" />}>Back to dashboard</Button>
    </div>
  );
}
