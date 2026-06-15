"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SubmitButton } from "./submit-button";
import type { ActionState } from "@/lib/forms";

/**
 * Inline single-shot mutation button (approve, release, issue, …).
 * Posts `fields` as hidden inputs to a server action; toasts + refreshes.
 */
export function ActionButton({
  action,
  fields = {},
  children,
  confirm,
  variant,
  size,
  className,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields?: Record<string, string | number | undefined | null>;
  children: React.ReactNode;
  confirm?: string;
  variant?: React.ComponentProps<typeof SubmitButton>["variant"];
  size?: React.ComponentProps<typeof SubmitButton>["size"];
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Done");
      if (state.redirectTo) router.push(state.redirectTo);
      else router.refresh();
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="inline"
    >
      {Object.entries(fields).map(([k, v]) =>
        v === undefined || v === null ? null : (
          <input key={k} type="hidden" name={k} value={String(v)} />
        ),
      )}
      <SubmitButton variant={variant} size={size} className={className}>
        {children}
      </SubmitButton>
    </form>
  );
}
