"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/field";
import { SubmitButton } from "@/components/app/submit-button";
import { changeOwnPassword } from "@/app/(app)/account/actions";

/**
 * Self-service "change my password" dialog. Controlled (open/onOpenChange) so it
 * can be triggered from the sidebar user-menu dropdown without nesting a dialog
 * trigger inside a menu item (which fights over focus on close).
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [state, formAction] = useActionState(changeOwnPassword, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Password changed");
      onOpenChange(false);
      router.refresh();
    } else if (state && !state.ok && state.error) {
      toast.error(state.error);
    }
  }, [state, router, onOpenChange]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Update the password you use to sign in.
          </DialogDescription>
        </DialogHeader>
        {/* key remounts the form (and clears the password fields) each time the
            dialog opens, so a previous attempt's values never linger. */}
        <form key={open ? "open" : "closed"} action={formAction} className="space-y-4">
          <Field
            label="Current password"
            htmlFor="currentPassword"
            required
            error={errors.currentPassword}
          >
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
            />
          </Field>
          <Field
            label="New password"
            htmlFor="newPassword"
            required
            error={errors.newPassword}
            hint="Minimum 8 characters."
          >
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          <Field
            label="Confirm new password"
            htmlFor="confirmPassword"
            required
            error={errors.confirmPassword}
          >
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          {state && !state.ok && state.error && (
            <p className="rounded-md bg-critical/10 px-3 py-2 text-sm text-critical">
              {state.error}
            </p>
          )}
          <DialogFooter>
            <SubmitButton>Change password</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
