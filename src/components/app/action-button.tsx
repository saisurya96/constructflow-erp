"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmitButton } from "./submit-button";
import type { ActionState } from "@/lib/forms";

/**
 * Inline single-shot mutation button (approve, release, issue, …).
 * Posts `fields` as hidden inputs to a server action; toasts + refreshes.
 *
 * When `confirm` is set, the click is gated behind the app's own styled
 * confirmation dialog (not the native window.confirm, which is jarring against
 * the rest of the UI and impossible to brand/test). The real submit still fires
 * from this form, so SubmitButton's pending state keeps working.
 */
export function ActionButton({
  action,
  fields = {},
  children,
  confirm,
  confirmLabel = "Confirm",
  variant,
  size,
  className,
  "aria-label": ariaLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields?: Record<string, string | number | undefined | null>;
  children: React.ReactNode;
  confirm?: string;
  confirmLabel?: string;
  variant?: React.ComponentProps<typeof SubmitButton>["variant"];
  size?: React.ComponentProps<typeof SubmitButton>["size"];
  className?: string;
  "aria-label"?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

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
      ref={formRef}
      action={formAction}
      onSubmit={(e) => {
        // First attempt with a confirm gate: stop and ask. The styled dialog's
        // Confirm button re-submits with confirmedRef set, which passes through.
        if (confirm && !confirmedRef.current) {
          e.preventDefault();
          setConfirmOpen(true);
          return;
        }
        confirmedRef.current = false;
      }}
      className="inline"
    >
      {Object.entries(fields).map(([k, v]) =>
        v === undefined || v === null ? null : (
          <input key={k} type="hidden" name={k} value={String(v)} />
        ),
      )}
      <SubmitButton variant={variant} size={size} className={className} aria-label={ariaLabel}>
        {children}
      </SubmitButton>

      {confirm && (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent showCloseButton={false} className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Please confirm</DialogTitle>
              <DialogDescription>{confirm}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={variant === "outline" || variant === "ghost" ? "default" : variant}
                size="sm"
                onClick={() => {
                  confirmedRef.current = true;
                  setConfirmOpen(false);
                  formRef.current?.requestSubmit();
                }}
              >
                {confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </form>
  );
}
