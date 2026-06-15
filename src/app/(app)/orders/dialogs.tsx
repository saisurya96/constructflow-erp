"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/app/form-dialog";
import { Field, DateField, NativeSelect } from "@/components/app/field";
import { UNITS } from "@/lib/constants";
import { num, formatMoney } from "@/lib/money";
import { createPurchaseOrder, updatePurchaseOrder } from "./actions";

type Option = { id: string; label: string };

type LineRow = {
  key: number;
  itemName: string;
  unit: string;
  qty: string;
  price: string;
  wbsId: string;
};

type PoDefaults = {
  type: string;
  vendorId: string;
  projectId: string;
  title: string;
  expectedDate: string | null;
  paymentTerms: string | null;
  notes: string | null;
  lines: { itemName: string; unit: string; quantity: string; unitPrice: string; wbsId: string | null }[];
};

let lineSeq = 0;
function blankLine(): LineRow {
  return { key: lineSeq++, itemName: "", unit: "pcs", qty: "", price: "", wbsId: "" };
}

function PoFields({
  errors,
  vendorOptions,
  projectOptions,
  wbsByProject,
  defaults,
  currency = "AED",
}: {
  errors: Record<string, string>;
  vendorOptions: Option[];
  projectOptions: Option[];
  wbsByProject: Record<string, Option[]>;
  defaults?: PoDefaults;
  currency?: string;
}) {
  const [lines, setLines] = useState<LineRow[]>(() =>
    defaults && defaults.lines.length
      ? defaults.lines.map((l) => ({
          key: lineSeq++,
          itemName: l.itemName,
          unit: l.unit,
          qty: String(Number(l.quantity)),
          price: String(Number(l.unitPrice)),
          wbsId: l.wbsId ?? "",
        }))
      : [blankLine()],
  );
  const [projectId, setProjectId] = useState(defaults?.projectId ?? "");

  const wbsOptions = projectId ? (wbsByProject[projectId] ?? []) : [];

  function setLine(key: number, patch: Partial<LineRow>) {
    setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addLine() {
    setLines((rows) => [...rows, blankLine()]);
  }
  function removeLine(key: number) {
    setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));
  }

  const subtotal = lines.reduce((s, l) => s + num(l.qty) * num(l.price), 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor="type">
          <NativeSelect id="type" name="type" defaultValue={defaults?.type ?? "purchase_order"}>
            <option value="purchase_order">Purchase order</option>
            <option value="subcontract">Subcontract</option>
          </NativeSelect>
        </Field>
        <Field label="Vendor" htmlFor="vendorId" required error={errors.vendorId}>
          <NativeSelect id="vendorId" name="vendorId" defaultValue={defaults?.vendorId ?? ""} required>
            <option value="" disabled>
              Select vendor
            </option>
            {vendorOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field label="Title" htmlFor="title" required error={errors.title}>
        <Input id="title" name="title" required placeholder="Rebar supply — Tower A" defaultValue={defaults?.title ?? ""} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Project" htmlFor="projectId">
          <NativeSelect
            id="projectId"
            name="projectId"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.currentTarget.value);
              // reset any chosen cost codes that no longer apply
              setLines((rows) => rows.map((r) => ({ ...r, wbsId: "" })));
            }}
          >
            <option value="">— none —</option>
            {projectOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Expected date" htmlFor="expectedDate">
          <DateField name="expectedDate" defaultValue={defaults?.expectedDate ?? undefined} />
        </Field>
      </div>

      <Field label="Payment terms" htmlFor="paymentTerms">
        <Input id="paymentTerms" name="paymentTerms" placeholder="30 days net" defaultValue={defaults?.paymentTerms ?? ""} />
      </Field>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">Line items</span>
          <Button type="button" size="xs" variant="outline" onClick={addLine}>
            <Plus className="size-3.5" /> Add line
          </Button>
        </div>

        <div className="space-y-2">
          {lines.map((l) => (
            <div
              key={l.key}
              className="grid grid-cols-[1fr_auto_auto_auto_1fr_auto] items-end gap-2 rounded-lg border bg-muted/20 p-2"
            >
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Item
                </label>
                <Input
                  name="lineItem"
                  value={l.itemName}
                  onChange={(e) => setLine(l.key, { itemName: e.currentTarget.value })}
                  placeholder="Y16 rebar"
                  className="h-8"
                />
              </div>
              <div className="w-20 space-y-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Unit
                </label>
                <NativeSelect
                  name="lineUnit"
                  value={l.unit}
                  onChange={(e) => setLine(l.key, { unit: e.currentTarget.value })}
                  className="h-8 text-xs"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="w-20 space-y-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Qty
                </label>
                <Input
                  name="lineQty"
                  type="number"
                  step="0.001"
                  min="0"
                  value={l.qty}
                  onChange={(e) => setLine(l.key, { qty: e.currentTarget.value })}
                  className="h-8 tabular"
                />
              </div>
              <div className="w-24 space-y-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Unit price
                </label>
                <Input
                  name="linePrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.price}
                  onChange={(e) => setLine(l.key, { price: e.currentTarget.value })}
                  className="h-8 tabular"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Cost code
                </label>
                <NativeSelect
                  name="lineWbs"
                  value={l.wbsId}
                  onChange={(e) => setLine(l.key, { wbsId: e.currentTarget.value })}
                  className="h-8 text-xs"
                  disabled={wbsOptions.length === 0}
                >
                  <option value="">— none —</option>
                  {wbsOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => removeLine(l.key)}
                aria-label="Remove line"
                disabled={lines.length === 1}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 px-1 text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium tabular">{formatMoney(subtotal, currency)}</span>
          <span className="text-xs text-muted-foreground">+ VAT on submit</span>
        </div>
      </div>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} placeholder="Special instructions, delivery conditions…" defaultValue={defaults?.notes ?? ""} />
      </Field>
    </>
  );
}

export function CreatePoDialog({
  vendorOptions,
  projectOptions,
  wbsByProject,
  currency = "AED",
}: {
  vendorOptions: Option[];
  projectOptions: Option[];
  /** projectId -> WBS options, so cost codes follow the chosen project. */
  wbsByProject: Record<string, Option[]>;
  currency?: string;
}) {
  return (
    <FormDialog
      title="New purchase order"
      description="Raise a purchase order or subcontract. VAT and totals are computed automatically."
      action={createPurchaseOrder}
      submitLabel="Create order"
      className="sm:max-w-2xl"
      trigger={
        <Button size="sm">
          <Plus className="size-4" /> New PO
        </Button>
      }
    >
      {({ errors }) => (
        <PoFields
          errors={errors}
          vendorOptions={vendorOptions}
          projectOptions={projectOptions}
          wbsByProject={wbsByProject}
          currency={currency}
        />
      )}
    </FormDialog>
  );
}

export function EditPoDialog({
  poId,
  vendorOptions,
  projectOptions,
  wbsByProject,
  defaults,
  currency = "AED",
}: {
  poId: string;
  vendorOptions: Option[];
  projectOptions: Option[];
  wbsByProject: Record<string, Option[]>;
  defaults: PoDefaults;
  currency?: string;
}) {
  return (
    <FormDialog
      title="Edit draft order"
      description="Correct the vendor, lines, dates or terms before submitting."
      action={updatePurchaseOrder}
      submitLabel="Save changes"
      className="sm:max-w-2xl"
      trigger={
        <Button size="sm" variant="outline">
          <Pencil className="size-4" /> Edit
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="poId" value={poId} />
          <PoFields
            errors={errors}
            vendorOptions={vendorOptions}
            projectOptions={projectOptions}
            wbsByProject={wbsByProject}
            defaults={defaults}
            currency={currency}
          />
        </>
      )}
    </FormDialog>
  );
}
