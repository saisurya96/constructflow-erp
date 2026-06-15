"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/app/form-dialog";
import { Field, NativeSelect } from "@/components/app/field";
import { postManualCost } from "./actions";

type Option = { id: string; label: string };

export function PostCostDialog({
  projectId,
  wbsOptions,
}: {
  projectId: string;
  wbsOptions: Option[];
}) {
  return (
    <FormDialog
      title="Post manual cost"
      description="Record a budget adjustment, accrual or actual outside the procurement flow."
      action={postManualCost}
      submitLabel="Post cost"
      trigger={
        <Button size="sm" variant="outline">
          <Plus className="size-4" /> Post cost
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cost type" htmlFor="type" required error={errors.type}>
              <NativeSelect id="type" name="type" defaultValue="actual">
                <option value="actual">Actual</option>
                <option value="commitment">Commitment</option>
                <option value="forecast">Forecast</option>
                <option value="budget">Budget adjustment</option>
              </NativeSelect>
            </Field>
            <Field label="Amount" htmlFor="amount" required error={errors.amount}>
              <Input id="amount" name="amount" type="number" step="0.01" defaultValue="0" required />
            </Field>
          </div>
          <Field
            label="Cost code (WBS)"
            htmlFor="wbsId"
            hint="Leave unassigned to post at project level."
          >
            <NativeSelect id="wbsId" name="wbsId" defaultValue="">
              <option value="">— project level —</option>
              {wbsOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description}>
            <Textarea id="description" name="description" rows={2} placeholder="Reason for the posting" />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
