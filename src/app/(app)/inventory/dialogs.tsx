"use client";

import { Plus, Warehouse, SlidersHorizontal, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/app/form-dialog";
import { Field, NativeSelect } from "@/components/app/field";
import { UNITS } from "@/lib/constants";
import { createWarehouse, adjustStock, reserveAllocation } from "./actions";

type Option = { id: string; label: string };

export function AddWarehouseDialog({ projectOptions }: { projectOptions: Option[] }) {
  return (
    <FormDialog
      title="Add warehouse"
      description="A physical store or site lay-down area that holds stock."
      action={createWarehouse}
      submitLabel="Create warehouse"
      trigger={
        <Button size="sm" variant="outline">
          <Warehouse className="size-4" /> Add warehouse
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Name" htmlFor="name" required error={errors.name} className="col-span-2">
              <Input id="name" name="name" required placeholder="Main Store" />
            </Field>
            <Field label="Code" htmlFor="code" error={errors.code}>
              <Input id="code" name="code" placeholder="WH-1" />
            </Field>
          </div>
          <Field label="Project (optional)" htmlFor="projectId" hint="Leave blank for a central store.">
            <NativeSelect id="projectId" name="projectId" defaultValue="">
              <option value="">— central / shared —</option>
              {projectOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Address" htmlFor="address">
            <Textarea id="address" name="address" rows={2} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function AdjustStockDialog({
  warehouseOptions,
}: {
  warehouseOptions: Option[];
}) {
  return (
    <FormDialog
      title="Stock adjustment"
      description="Correct stock for counts, damage or write-offs. Use a signed quantity (negative to reduce)."
      action={adjustStock}
      submitLabel="Apply adjustment"
      trigger={
        <Button size="sm">
          <SlidersHorizontal className="size-4" /> Stock adjustment
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <Field label="Warehouse" htmlFor="warehouseId" required error={errors.warehouseId}>
            <NativeSelect id="warehouseId" name="warehouseId" required defaultValue={warehouseOptions[0]?.id ?? ""}>
              {warehouseOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Item" htmlFor="itemName" required error={errors.itemName}>
            <Input id="itemName" name="itemName" required placeholder="Cement OPC 50kg" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Quantity (±)" htmlFor="quantity" required error={errors.quantity}>
              <Input id="quantity" name="quantity" type="number" step="0.001" required placeholder="-5" />
            </Field>
            <Field label="Unit" htmlFor="unit" required error={errors.unit}>
              <NativeSelect id="unit" name="unit" defaultValue="pcs">
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Unit cost" htmlFor="unitCost" error={errors.unitCost} hint="For inbound only">
              <Input id="unitCost" name="unitCost" type="number" step="0.01" min="0" defaultValue="0" />
            </Field>
          </div>
          <Field label="Reason" htmlFor="reason">
            <Input id="reason" name="reason" placeholder="Cycle count correction" />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function ReserveAllocationDialog({
  itemId,
  itemName,
  available,
  unit,
  unitCost,
  projectOptions,
  taskOptions,
  requirementId,
  projectId,
  wbsId,
  trigger,
}: {
  itemId: string;
  itemName: string;
  available: number;
  unit: string;
  unitCost: number;
  projectOptions: Option[];
  /** task options keyed by project id (only the chosen project's tasks matter). */
  taskOptions: Option[];
  requirementId?: string;
  projectId?: string;
  wbsId?: string;
  trigger?: React.ReactElement;
}) {
  return (
    <FormDialog
      title={`Reserve ${itemName}`}
      description={`${available} ${unit} available · unit cost ${unitCost.toFixed(2)}`}
      action={reserveAllocation}
      submitLabel="Reserve stock"
      trigger={
        trigger ?? (
          <Button size="xs" variant="outline">
            <Split className="size-3.5" /> Reserve
          </Button>
        )
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="itemId" value={itemId} />
          {requirementId && <input type="hidden" name="requirementId" value={requirementId} />}
          {wbsId && <input type="hidden" name="wbsId" value={wbsId} />}
          {projectId ? (
            <input type="hidden" name="projectId" value={projectId} />
          ) : (
            <Field label="Project" htmlFor="projectId" required error={errors.projectId}>
              <NativeSelect id="projectId" name="projectId" required defaultValue="">
                <option value="" disabled>Select a project</option>
                {projectOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {taskOptions.length > 0 && (
            <Field label="Task (optional)" htmlFor="taskId" hint="Reserving unblocks a blocked task.">
              <NativeSelect id="taskId" name="taskId" defaultValue="">
                <option value="">— none —</option>
                {taskOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Quantity" htmlFor="quantity" required error={errors.quantity}>
            <Input
              id="quantity"
              name="quantity"
              type="number"
              step="0.001"
              min="0"
              max={available}
              defaultValue={available > 0 ? String(available) : ""}
              required
            />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
