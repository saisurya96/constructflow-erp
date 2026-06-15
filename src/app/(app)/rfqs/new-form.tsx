"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, DateField, NativeSelect } from "@/components/app/field";
import { SubmitButton } from "@/components/app/submit-button";
import { SectionCard } from "@/components/app/section-card";
import { UNITS } from "@/lib/constants";
import { createRfq } from "./actions";

type Option = { id: string; label: string };
type VendorOption = { id: string; label: string; category: string | null };

export function NewRfqForm({
  projectOptions,
  vendorOptions,
  requirement,
}: {
  projectOptions: Option[];
  vendorOptions: VendorOption[];
  requirement: {
    id: string;
    itemName: string;
    unit: string;
    quantity: string;
    projectId: string;
  } | null;
}) {
  const [state, formAction] = useActionState(createRfq, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "RFQ issued");
      if (state.redirectTo) router.push(state.redirectTo);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, router]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="space-y-4">
      {requirement && (
        <input type="hidden" name="requirementId" value={requirement.id} />
      )}

      <SectionCard title="Request details">
        <div className="space-y-4">
          <Field label="Title" htmlFor="title" required error={errors.title}>
            <Input
              id="title"
              name="title"
              required
              placeholder="Reinforcement steel supply"
              defaultValue={requirement ? `Supply: ${requirement.itemName}` : ""}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project" htmlFor="projectId" required error={errors.projectId}>
              <NativeSelect
                id="projectId"
                name="projectId"
                defaultValue={requirement?.projectId ?? ""}
                required
              >
                <option value="" disabled>
                  Select a project
                </option>
                {projectOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Quotes due by" htmlFor="dueDate" error={errors.dueDate}>
              <DateField name="dueDate" />
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Item" description="A single line item for this request.">
        <div className="grid grid-cols-6 gap-3">
          <Field
            label="Item"
            htmlFor="itemName"
            required
            error={errors.itemName}
            className="col-span-4"
          >
            <Input
              id="itemName"
              name="itemName"
              required
              placeholder="Reinforcement steel Y16"
              defaultValue={requirement?.itemName ?? ""}
            />
          </Field>
          <Field label="Quantity" htmlFor="quantity" required error={errors.quantity}>
            <Input
              id="quantity"
              name="quantity"
              type="number"
              step="0.001"
              min="0"
              required
              defaultValue={requirement?.quantity ?? ""}
            />
          </Field>
          <Field label="Unit" htmlFor="unit" required error={errors.unit}>
            <NativeSelect id="unit" name="unit" defaultValue={requirement?.unit ?? "pcs"}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Invite vendors"
        description="Each invited vendor gets a pending quote slot."
      >
        {vendorOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active vendors. Add vendors first to issue an RFQ.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {vendorOptions.map((v) => (
                <label
                  key={v.id}
                  className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    name="vendorIds"
                    value={v.id}
                    className="size-4 rounded border-input accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{v.label}</span>
                    {v.category && (
                      <span className="block text-xs text-muted-foreground">{v.category}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {errors.vendorIds && (
              <p className="text-xs text-critical">{errors.vendorIds}</p>
            )}
          </div>
        )}
      </SectionCard>

      {state && !state.ok && state.error && (
        <p className="rounded-md bg-critical/10 px-3 py-2 text-sm text-critical">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Issuing…">
          <Send className="size-4" /> Issue RFQ
        </SubmitButton>
      </div>
    </form>
  );
}
