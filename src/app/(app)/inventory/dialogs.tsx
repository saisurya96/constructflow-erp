"use client";

import { Warehouse, SlidersHorizontal, Split, Pencil, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/app/form-dialog";
import { Field, NativeSelect } from "@/components/app/field";
import { formatMoney } from "@/lib/money";
import { UNITS } from "@/lib/constants";
import {
  createWarehouse,
  updateWarehouse,
  adjustStock,
  reserveAllocation,
  setReorderPoint,
} from "./actions";

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

export function EditWarehouseDialog({
  warehouse,
  projectOptions,
}: {
  warehouse: { id: string; name: string; code: string | null; projectId: string | null; address: string | null };
  projectOptions: Option[];
}) {
  return (
    <FormDialog
      title="Edit warehouse"
      action={updateWarehouse}
      submitLabel="Save"
      trigger={
        <Button size="xs" variant="ghost">
          <Pencil className="size-3.5" /> Edit
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="warehouseId" value={warehouse.id} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Name" htmlFor="name" required error={errors.name} className="col-span-2">
              <Input id="name" name="name" required defaultValue={warehouse.name} />
            </Field>
            <Field label="Code" htmlFor="code" error={errors.code}>
              <Input id="code" name="code" defaultValue={warehouse.code ?? ""} />
            </Field>
          </div>
          <Field label="Project (optional)" htmlFor="projectId">
            <NativeSelect id="projectId" name="projectId" defaultValue={warehouse.projectId ?? ""}>
              <option value="">— central / shared —</option>
              {projectOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Address" htmlFor="address">
            <Textarea id="address" name="address" rows={2} defaultValue={warehouse.address ?? ""} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function SetReorderDialog({
  itemId,
  itemName,
  unit,
  current,
}: {
  itemId: string;
  itemName: string;
  unit: string;
  current: number;
}) {
  return (
    <FormDialog
      title={`Reorder point — ${itemName}`}
      description="Stock at or below this available quantity is flagged as low. Set 0 to disable the alert."
      action={setReorderPoint}
      submitLabel="Save"
      trigger={
        <Button size="xs" variant="ghost">
          <Bell className="size-3.5" /> {current > 0 ? "Edit" : "Set"}
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="itemId" value={itemId} />
          <Field label={`Reorder point (${unit})`} htmlFor="reorderPoint" required error={errors.reorderPoint}>
            <Input
              id="reorderPoint"
              name="reorderPoint"
              type="number"
              step="0.001"
              min="0"
              defaultValue={String(current)}
              required
            />
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
  canSeeCost = true,
  projectOptions,
  taskOptions,
  requirementId,
  projectId,
  taskId,
  wbsId,
  currency,
  trigger,
}: {
  itemId: string;
  itemName: string;
  available: number;
  unit: string;
  unitCost: number;
  /** Hide landed unit cost from roles without costing.view (e.g. storekeeper). */
  canSeeCost?: boolean;
  currency: string;
  projectOptions: Option[];
  /** task options keyed by project id (only the chosen project's tasks matter). */
  taskOptions: Option[];
  requirementId?: string;
  projectId?: string;
  /** the requirement's already-linked task — pre-selected so it isn't re-picked. */
  taskId?: string;
  wbsId?: string;
  trigger?: React.ReactElement;
}) {
  return (
    <FormDialog
      title={`Reserve ${itemName}`}
      description={`${available} ${unit} available${
        canSeeCost ? ` · unit cost ${formatMoney(unitCost, currency)}` : ""
      }`}
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
              <NativeSelect id="taskId" name="taskId" defaultValue={taskId ?? ""}>
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
