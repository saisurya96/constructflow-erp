"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Save, Pencil, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/app/form-dialog";
import { SubmitButton } from "@/components/app/submit-button";
import { Field, NativeSelect } from "@/components/app/field";
import { ROLE_LABELS } from "@/lib/rbac";
import type { UserRole } from "@/db/schema";
import {
  createUser,
  updateUser,
  updateUserRole,
  setUserActive,
  resetUserPassword,
  updateCompany,
} from "./actions";

const ROLE_OPTIONS: UserRole[] = ["admin", "pm", "buyer", "storekeeper", "finance"];

export function InviteUserDialog() {
  return (
    <FormDialog
      title="Add team member"
      description="Create a login for a colleague. They sign in with the email and password you set here."
      action={createUser}
      submitLabel="Add user"
      trigger={
        <Button size="sm">
          <UserPlus className="size-4" /> Invite / add user
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <Field label="Full name" htmlFor="fullName" required error={errors.fullName}>
            <Input id="fullName" name="fullName" required placeholder="Aisha Rahman" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" htmlFor="email" required error={errors.email}>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="name@company.com"
              />
            </Field>
            <Field label="Job title" htmlFor="title" error={errors.title}>
              <Input id="title" name="title" placeholder="Site Engineer" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role" htmlFor="role" required error={errors.role}>
              <NativeSelect id="role" name="role" defaultValue="pm">
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label="Temporary password"
              htmlFor="password"
              required
              error={errors.password}
              hint="Minimum 8 characters."
            >
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}

/**
 * Inline role <select> that submits on change. The dropdown is controlled so it
 * reflects the persisted role across revalidation (an uncontrolled select would
 * snap back to its initial value after a successful change). Grants/revokes of
 * full Administrator access are gated behind the app's styled confirm dialog
 * rather than the jarring, unbrandable native window.confirm.
 */
export function RoleControl({
  userId,
  role,
}: {
  userId: string;
  role: UserRole;
}) {
  const [state, formAction] = useActionState(updateUserRole, null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState<UserRole>(role);
  const [pending, setPending] = useState<UserRole | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setValue(role), [role]);
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Role updated");
      router.refresh();
    } else if (state && !state.ok) {
      toast.error(state.error);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(role); // roll the dropdown back if the server rejected it
    }
  }, [state, role, router]);

  const onChange = (next: UserRole) => {
    setValue(next);
    // Confirm any change that grants or revokes full Administrator access.
    if (next === "admin" || role === "admin") {
      setPending(next);
    } else {
      formRef.current?.requestSubmit();
    }
  };

  const cancelPending = () => {
    setPending(null);
    setValue(role);
  };

  return (
    <>
      <form ref={formRef} action={formAction} className="inline">
        <input type="hidden" name="userId" value={userId} />
        <NativeSelect
          name="role"
          value={value}
          className="h-8 w-44 text-xs"
          onChange={(e) => onChange(e.currentTarget.value as UserRole)}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </NativeSelect>
      </form>

      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) cancelPending(); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {pending === "admin"
                ? "Grant administrator access?"
                : "Change administrator access?"}
            </DialogTitle>
            <DialogDescription>
              {pending === "admin"
                ? "This gives the user full control of the company — people, projects, money and all data."
                : "This removes the user's full administrator access. They keep only the permissions of their new role."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={cancelPending}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setPending(null);
                formRef.current?.requestSubmit();
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditUserDialog({
  user,
}: {
  user: { id: string; fullName: string; email: string; title: string | null; phone: string | null };
}) {
  return (
    <FormDialog
      title="Edit team member"
      action={updateUser}
      submitLabel="Save"
      trigger={
        <Button size="xs" variant="ghost">
          <Pencil className="size-3.5" /> Edit
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="userId" value={user.id} />
          <Field label="Full name" htmlFor="fullName" required error={errors.fullName}>
            <Input id="fullName" name="fullName" required defaultValue={user.fullName} />
          </Field>
          <Field label="Email" htmlFor="email" required error={errors.email}>
            <Input id="email" name="email" type="email" required defaultValue={user.email} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Job title" htmlFor="title" error={errors.title}>
              <Input id="title" name="title" defaultValue={user.title ?? ""} placeholder="Site Engineer" />
            </Field>
            <Field label="Phone" htmlFor="phone" error={errors.phone}>
              <Input id="phone" name="phone" defaultValue={user.phone ?? ""} placeholder="+1 555 000 0000" />
            </Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function ResetPasswordDialog({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  return (
    <FormDialog
      title={`Reset password — ${userName}`}
      description="Set a new temporary password and share it with the user. They sign in with it immediately."
      action={resetUserPassword}
      submitLabel="Reset password"
      trigger={
        <Button size="xs" variant="ghost">
          <KeyRound className="size-3.5" /> Reset password
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <Field label="New temporary password" htmlFor="password" required error={errors.password} hint="Minimum 8 characters.">
            <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

/** Activate / deactivate toggle button. */
export function ActiveControl({
  userId,
  active,
  disabled,
}: {
  userId: string;
  active: boolean;
  disabled?: boolean;
}) {
  const [state, formAction] = useActionState(setUserActive, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Done");
      router.refresh();
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <SubmitButton variant="ghost" size="xs" disabled={disabled}>
        {active ? "Deactivate" : "Activate"}
      </SubmitButton>
    </form>
  );
}

export function CompanySettingsForm({
  company,
}: {
  company: {
    name: string;
    currencyCode: string;
    vatRate: string;
    poApprovalThreshold: string;
    address: string | null;
  };
}) {
  const [state, formAction] = useActionState(updateCompany, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Saved");
      router.refresh();
    } else if (state && !state.ok && state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Company name" htmlFor="name" required error={errors.name}>
        <Input id="name" name="name" required defaultValue={company.name} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Currency code"
          htmlFor="currencyCode"
          required
          error={errors.currencyCode}
          hint="3-letter ISO code, e.g. USD."
        >
          <Input
            id="currencyCode"
            name="currencyCode"
            required
            maxLength={3}
            className="uppercase"
            defaultValue={company.currencyCode}
          />
        </Field>
        <Field
          label="VAT rate %"
          htmlFor="vatRate"
          required
          error={errors.vatRate}
          hint="Applied to taxable purchase orders & invoices."
        >
          <Input
            id="vatRate"
            name="vatRate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            required
            defaultValue={company.vatRate}
          />
        </Field>
      </div>
      <Field
        label="PO approval threshold"
        htmlFor="poApprovalThreshold"
        required
        error={errors.poApprovalThreshold}
        hint="Orders at or above this amount route through Approvals before release."
      >
        <Input
          id="poApprovalThreshold"
          name="poApprovalThreshold"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={company.poApprovalThreshold}
        />
      </Field>
      <Field label="Registered address" htmlFor="address" error={errors.address}>
        <Textarea
          id="address"
          name="address"
          rows={2}
          defaultValue={company.address ?? ""}
        />
      </Field>
      <div className="flex justify-end">
        <SubmitButton>
          <Save className="size-4" /> Save settings
        </SubmitButton>
      </div>
    </form>
  );
}
