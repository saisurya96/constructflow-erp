"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, DateField, NativeSelect } from "@/components/app/field";
import { SubmitButton } from "@/components/app/submit-button";
import { SectionCard } from "@/components/app/section-card";
import { EmptyState } from "@/components/app/empty-state";
import { formatNumber } from "@/lib/money";
import { postGoodsReceipt } from "@/app/(app)/inventory/actions";

type PoLine = {
  id: string;
  itemName: string;
  unit: string;
  quantity: number;
  receivedQty: number;
};

export type PoOption = {
  id: string;
  number: string;
  vendorName: string | null;
  projectCode: string | null;
  expectedDate: string | null;
  lines: PoLine[];
};

type WarehouseOption = { id: string; label: string };

export function NewGrnForm({
  pos,
  warehouses,
  initialPoId,
  todayIso,
}: {
  pos: PoOption[];
  warehouses: WarehouseOption[];
  initialPoId?: string;
  todayIso: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(postGoodsReceipt, null);
  const [poId, setPoId] = useState(
    initialPoId && pos.some((p) => p.id === initialPoId) ? initialPoId : pos[0]?.id ?? "",
  );

  const selected = useMemo(() => pos.find((p) => p.id === poId), [pos, poId]);

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Posted");
      router.push(state.redirectTo ?? "/receipts");
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, router]);

  if (pos.length === 0) {
    return (
      <SectionCard>
        <EmptyState
          icon={<PackageCheck className="size-5" />}
          title="No orders to receive"
          description="A purchase order must be released before its goods can be received."
        />
      </SectionCard>
    );
  }

  if (warehouses.length === 0) {
    return (
      <SectionCard>
        <EmptyState
          icon={<PackageCheck className="size-5" />}
          title="No warehouse available"
          description="Add a warehouse on the Inventory page before receiving goods."
        />
      </SectionCard>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <SectionCard title="Receipt details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Purchase order" htmlFor="poId" required>
            <NativeSelect
              id="poId"
              name="poId"
              value={poId}
              onChange={(e) => setPoId(e.currentTarget.value)}
              required
            >
              {pos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number}
                  {p.vendorName ? ` · ${p.vendorName}` : ""}
                  {p.projectCode ? ` · ${p.projectCode}` : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Warehouse" htmlFor="warehouseId" required>
            <NativeSelect id="warehouseId" name="warehouseId" required defaultValue={warehouses[0]?.id}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.label}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Delivery note #" htmlFor="deliveryNoteNumber">
            <Input id="deliveryNoteNumber" name="deliveryNoteNumber" placeholder="DN-12345" />
          </Field>
          <Field label="Received date" htmlFor="receivedDate" required>
            <DateField name="receivedDate" defaultValue={todayIso} required />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Lines" description="Accepted defaults to the outstanding amount; set it to 0 to skip a line. Record any damaged/refused units under Reject." noPadding>
        {!selected || selected.lines.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Nothing outstanding" description="Every line on this order is already fully received." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ordered</th>
                  <th className="px-4 py-2.5 text-right font-medium">Received</th>
                  <th className="px-4 py-2.5 text-right font-medium">Outstanding</th>
                  <th className="px-4 py-2.5 text-right font-medium w-32">Accept now</th>
                  <th className="px-4 py-2.5 text-right font-medium w-28">Reject</th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((l) => {
                  const remaining = Math.max(0, l.quantity - l.receivedQty);
                  return (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{l.itemName}</span>
                        <span className="block text-xs text-muted-foreground">{l.unit}</span>
                        <input type="hidden" name="lineId" value={l.id} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular">{formatNumber(l.quantity, 3)}</td>
                      <td className="px-4 py-2.5 text-right tabular text-muted-foreground">
                        {formatNumber(l.receivedQty, 3)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular">{formatNumber(remaining, 3)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Input
                          name="acceptedQty"
                          type="number"
                          step="0.001"
                          min="0"
                          max={remaining}
                          defaultValue={remaining > 0 ? String(remaining) : "0"}
                          className="h-8 w-28 text-right tabular"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Input
                          name="rejectedQty"
                          type="number"
                          step="0.001"
                          min="0"
                          defaultValue="0"
                          className="h-8 w-24 text-right tabular"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {state && !state.ok && state.error && (
        <p className="rounded-md bg-critical/10 px-3 py-2 text-sm text-critical">{state.error}</p>
      )}

      <div className="flex justify-end gap-2">
        <SubmitButton pendingLabel="Posting…">
          <PackageCheck className="size-4" /> Post goods receipt
        </SubmitButton>
      </div>
    </form>
  );
}
