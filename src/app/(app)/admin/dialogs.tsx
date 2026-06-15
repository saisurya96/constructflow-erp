"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/app/form-dialog";
import { SubmitButton } from "@/components/app/submit-button";
import { Field, NativeSelect } from "@/components/app/field";
import { ROLE_LABELS } from "@/lib/rbac";
import type { UserRole } from "@/db/schema";
import { createUser, updateUserRole, setUserActive, updateCompany } from "./actions";

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

/** Inline role <select> that submits on change. */
export function RoleControl({
  userId,
  role,
}: {
  userId: string;
  role: UserRole;
}) {
  const [state, formAction] = useActionState(updateUserRole, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Role updated");
      router.refresh();
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="userId" value={userId} />
      <NativeSelect
        name="role"
        defaultValue={role}
        className="h-8 w-44 text-xs"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {ROLE_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </NativeSelect>
    </form>
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
          hint="3-letter ISO code, e.g. AED."
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
