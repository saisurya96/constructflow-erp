"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SubmitButton } from "./submit-button";
import type { ActionState } from "@/lib/forms";

type FieldHelpers = { errors: Record<string, string> };

export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel = "Save",
  children,
  className,
}: {
  trigger: React.ReactElement;
  title: string;
  description?: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel?: string;
  className?: string;
  children: React.ReactNode | ((helpers: FieldHelpers) => React.ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Saved");
      setOpen(false);
      if (state.redirectTo) router.push(state.redirectTo);
      else router.refresh();
    }
  }, [state, router]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {typeof children === "function" ? children({ errors }) : children}
          {state && !state.ok && state.error && (
            <p className="rounded-md bg-critical/10 px-3 py-2 text-sm text-critical">
              {state.error}
            </p>
          )}
          <DialogFooter>
            <SubmitButton>{submitLabel}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
