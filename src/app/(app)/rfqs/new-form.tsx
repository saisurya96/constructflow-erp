"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field, DateField, NativeSelect } from "@/components/app/field";
import { SubmitButton } from "@/components/app/submit-button";
import { SectionCard } from "@/components/app/section-card";
import { UNITS } from "@/lib/constants";
import { createRfq } from "./actions";

type Option = { id: string; label: string };
type VendorOption = { id: string; label: string; category: string | null };
type LineRow = { key: number; itemName: string; quantity: string; unit: string };

let rowSeq = 1;
function blankRow(): LineRow {
  return { key: rowSeq++, itemName: "", quantity: "", unit: "pcs" };
}

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
  const [lines, setLines] = useState<LineRow[]>(() =>
    requirement
      ? [
          {
            key: rowSeq++,
            itemName: requirement.itemName,
            quantity: requirement.quantity,
            unit: requirement.unit,
          },
        ]
      : [blankRow()],
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "RFQ created");
      if (state.redirectTo) router.push(state.redirectTo);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, router]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  const update = (key: number, patch: Partial<LineRow>) =>
    setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) =>
    setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));

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
          <Field label="Notes for vendors" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={2} placeholder="Delivery conditions, specs, terms…" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Line items"
        description="List everything you want quoted. Vendors price each line."
      >
        <div className="space-y-2">
          <div className="hidden grid-cols-12 gap-2 px-1 sm:grid">
            <span className="eyebrow col-span-7 text-muted-foreground">Item</span>
            <span className="eyebrow col-span-2 text-muted-foreground">Quantity</span>
            <span className="eyebrow col-span-2 text-muted-foreground">Unit</span>
          </div>
          {lines.map((row) => (
            <div key={row.key} className="grid grid-cols-12 items-center gap-2">
              <Input
                aria-label="Item"
                className="col-span-12 sm:col-span-7"
                name="lineItem"
                placeholder="Reinforcement steel Y16"
                value={row.itemName}
                onChange={(e) => update(row.key, { itemName: e.target.value })}
              />
              <Input
                aria-label="Quantity"
                className="col-span-5 sm:col-span-2"
                name="lineQty"
                type="number"
                step="0.001"
                min="0"
                placeholder="0"
                value={row.quantity}
                onChange={(e) => update(row.key, { quantity: e.target.value })}
              />
              <NativeSelect
                aria-label="Unit"
                className="col-span-5 sm:col-span-2"
                name="lineUnit"
                value={row.unit}
                onChange={(e) => update(row.key, { unit: e.target.value })}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </NativeSelect>
              <div className="col-span-2 flex justify-end sm:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  nativeButton
                  disabled={lines.length === 1}
                  onClick={() => remove(row.key)}
                  aria-label="Remove line"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          {errors.lines && <p className="text-xs text-critical">{errors.lines}</p>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            nativeButton
            onClick={() => setLines((rows) => [...rows, blankRow()])}
          >
            <Plus className="size-4" /> Add item
          </Button>
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
        <SubmitButton pendingLabel="Creating…">
          <Send className="size-4" /> Create RFQ
        </SubmitButton>
      </div>
    </form>
  );
}
