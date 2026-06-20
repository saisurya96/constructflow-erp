"use client";

import { useState } from "react";
import { ClipboardEdit, Pencil, UserPlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/app/form-dialog";
import { Field, DateField, NativeSelect } from "@/components/app/field";
import { Eyebrow } from "@/components/app/eyebrow";
import { num, formatMoney, formatNumber } from "@/lib/money";
import { UNITS } from "@/lib/constants";
import { enterQuote, updateRfq, inviteVendorToRfq } from "./actions";

type QuoteLine = { id: string; itemName: string; unit: string; quantity: string };
type VendorOption = { id: string; name: string; category: string | null };

type EditLineRow = { key: number; itemName: string; quantity: string; unit: string };
let editRowSeq = 1;

/** Draft-only line editor for an RFQ — lines lock once quotes can arrive. */
function RfqLineEditor({ initial, error }: { initial: QuoteLine[]; error?: string }) {
  const [rows, setRows] = useState<EditLineRow[]>(() =>
    initial.length
      ? initial.map((l) => ({
          key: editRowSeq++,
          itemName: l.itemName,
          quantity: String(num(l.quantity)),
          unit: l.unit,
        }))
      : [{ key: editRowSeq++, itemName: "", quantity: "", unit: "pcs" }],
  );
  const update = (key: number, patch: Partial<EditLineRow>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const remove = (key: number) =>
    setRows((r) => (r.length > 1 ? r.filter((x) => x.key !== key) : r));
  return (
    <div className="space-y-2">
      <Eyebrow className="block text-muted-foreground">Line items</Eyebrow>
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-12 items-center gap-2">
          <Input
            aria-label="Item"
            className="col-span-12 sm:col-span-6"
            name="lineItem"
            placeholder="Reinforcement steel Y16"
            value={row.itemName}
            onChange={(e) => update(row.key, { itemName: e.target.value })}
          />
          <Input
            aria-label="Quantity"
            className="col-span-5 sm:col-span-3"
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
              disabled={rows.length === 1}
              onClick={() => remove(row.key)}
              aria-label="Remove line"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
      {error && <p className="text-xs text-critical">{error}</p>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        nativeButton
        onClick={() =>
          setRows((r) => [...r, { key: editRowSeq++, itemName: "", quantity: "", unit: "pcs" }])
        }
      >
        <Plus className="size-4" /> Add item
      </Button>
    </div>
  );
}

export function EditRfqDialog({
  rfq,
  lines,
}: {
  rfq: {
    id: string;
    title: string;
    dueDate: string | null;
    notes: string | null;
    status: string;
  };
  lines: QuoteLine[];
}) {
  const canEditLines = rfq.status === "draft";
  return (
    <FormDialog
      title="Edit RFQ"
      description={
        canEditLines
          ? "Update the details and line items for this draft."
          : "Update the title, due date or notes shown to vendors."
      }
      action={updateRfq}
      submitLabel="Save"
      trigger={
        <Button size="sm" variant="outline">
          <Pencil className="size-3.5" /> Edit
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="rfqId" value={rfq.id} />
          <Field label="Title" htmlFor="title" required error={errors.title}>
            <Input id="title" name="title" required defaultValue={rfq.title} />
          </Field>
          <Field label="Quotes due by" htmlFor="dueDate" error={errors.dueDate}>
            <DateField name="dueDate" defaultValue={rfq.dueDate ?? undefined} />
          </Field>
          <Field label="Notes for vendors" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={2} defaultValue={rfq.notes ?? ""} placeholder="Delivery conditions, specs, terms…" />
          </Field>
          {canEditLines && <RfqLineEditor initial={lines} error={errors.lines} />}
        </>
      )}
    </FormDialog>
  );
}

export function InviteVendorDialog({
  rfqId,
  vendors,
}: {
  rfqId: string;
  vendors: VendorOption[];
}) {
  if (vendors.length === 0) return null;
  return (
    <FormDialog
      title="Invite a vendor"
      description="Add another supplier to this RFQ — they get a pending quote slot."
      action={inviteVendorToRfq}
      submitLabel="Invite"
      trigger={
        <Button size="sm" variant="outline">
          <UserPlus className="size-3.5" /> Invite vendor
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="rfqId" value={rfqId} />
          <Field label="Vendor" htmlFor="vendorId" required error={errors.vendorId}>
            <NativeSelect id="vendorId" name="vendorId" defaultValue="">
              <option value="" disabled>
                Select a vendor
              </option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.category ? ` — ${v.category}` : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function EnterQuoteDialog({
  quoteId,
  vendorName,
  lines,
  defaults,
  currency = "USD",
}: {
  quoteId: string;
  vendorName: string;
  lines: QuoteLine[];
  defaults?: {
    leadTimeDays?: string;
    deliveryDate?: string | null;
    technicalCompliance?: string;
    paymentTerms?: string | null;
    prices?: Record<string, string>;
  };
  currency?: string;
}) {
  const received = !!defaults;
  const [prices, setPrices] = useState<Record<string, string>>(
    () => defaults?.prices ?? {},
  );

  const total = lines.reduce(
    (s, l) => s + num(prices[l.id]) * num(l.quantity),
    0,
  );

  return (
    <FormDialog
      title={`${received ? "Edit" : "Enter"} quote — ${vendorName}`}
      description="Price each line. Leave a line at 0 if the vendor can't supply it."
      action={enterQuote}
      submitLabel={received ? "Update quote" : "Save quote"}
      className="sm:max-w-xl"
      trigger={
        <Button size="xs" variant={received ? "ghost" : "outline"}>
          <ClipboardEdit className="size-3.5" /> {received ? "Edit" : "Enter quote"}
        </Button>
      }
    >
      {() => (
        <>
          <input type="hidden" name="quoteId" value={quoteId} />

          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 px-1">
              <Eyebrow className="col-span-6 text-muted-foreground">Item</Eyebrow>
              <Eyebrow className="col-span-3 text-right text-muted-foreground">
                Qty
              </Eyebrow>
              <Eyebrow className="col-span-3 text-right text-muted-foreground">
                Unit price
              </Eyebrow>
            </div>
            {lines.map((l) => (
              <div key={l.id} className="grid grid-cols-12 items-center gap-2">
                <input type="hidden" name="lineId" value={l.id} />
                <span className="col-span-6 truncate text-sm font-medium">
                  {l.itemName}
                </span>
                <span className="col-span-3 text-right text-xs text-muted-foreground tabular">
                  {formatNumber(l.quantity, 3)} {l.unit}
                </span>
                <Input
                  aria-label={`Unit price for ${l.itemName}`}
                  className="col-span-3"
                  name="linePrice"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={prices[l.id] ?? ""}
                  onChange={(e) =>
                    setPrices((p) => ({ ...p, [l.id]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-2 text-sm">
              <span className="text-muted-foreground">Quote total</span>
              <span className="font-display text-base font-semibold tabular">
                {formatMoney(total, currency)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Lead time (days)" htmlFor="leadTimeDays">
              <Input
                id="leadTimeDays"
                name="leadTimeDays"
                type="number"
                min="0"
                defaultValue={defaults?.leadTimeDays ?? ""}
              />
            </Field>
            <Field label="Delivery date" htmlFor="deliveryDate">
              <DateField name="deliveryDate" defaultValue={defaults?.deliveryDate ?? undefined} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Technical compliance %" htmlFor="technicalCompliance">
              <Input
                id="technicalCompliance"
                name="technicalCompliance"
                type="number"
                min="0"
                max="100"
                step="0.01"
                defaultValue={defaults?.technicalCompliance ?? "0"}
              />
            </Field>
            <Field label="Payment terms" htmlFor="paymentTerms">
              <Input
                id="paymentTerms"
                name="paymentTerms"
                placeholder="30 days net"
                defaultValue={defaults?.paymentTerms ?? ""}
              />
            </Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}
