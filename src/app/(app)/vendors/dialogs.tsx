"use client";

import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormDialog } from "@/components/app/form-dialog";
import { Field, NativeSelect } from "@/components/app/field";
import { VENDOR_CATEGORIES } from "@/lib/constants";
import { createVendor, updateVendor } from "./actions";

type VendorInput = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isSubcontractor: boolean;
  rating: string;
  notes: string | null;
};

function VendorFields({
  errors,
  vendor,
}: {
  errors: Record<string, string>;
  vendor?: VendorInput;
}) {
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Vendor name" htmlFor="name" required error={errors.name} className="col-span-2">
          <Input id="name" name="name" required placeholder="Acme Supply Co." defaultValue={vendor?.name} />
        </Field>
        <Field label="Code" htmlFor="code" error={errors.code}>
          <Input id="code" name="code" placeholder="V-001" defaultValue={vendor?.code ?? ""} />
        </Field>
      </div>
      <Field label="Category" htmlFor="category" error={errors.category}>
        <NativeSelect id="category" name="category" defaultValue={vendor?.category ?? ""}>
          <option value="">— uncategorized —</option>
          {VENDOR_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact name" htmlFor="contactName" error={errors.contactName}>
          <Input id="contactName" name="contactName" placeholder="Sales rep" defaultValue={vendor?.contactName ?? ""} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors.phone}>
          <Input id="phone" name="phone" placeholder="+1 555 000 0000" defaultValue={vendor?.phone ?? ""} />
        </Field>
      </div>
      <Field label="Email" htmlFor="email" error={errors.email}>
        <Input id="email" name="email" type="email" placeholder="sales@vendor.com" defaultValue={vendor?.email ?? ""} />
      </Field>
      <Field label="Address" htmlFor="address" error={errors.address}>
        <Input id="address" name="address" placeholder="123 Main St, City" defaultValue={vendor?.address ?? ""} />
      </Field>
      <div className="grid grid-cols-2 items-end gap-3">
        <Field label="Rating (0–5)" htmlFor="rating" error={errors.rating}>
          <Input
            id="rating"
            name="rating"
            type="number"
            step="0.1"
            min="0"
            max="5"
            defaultValue={vendor ? String(Number(vendor.rating)) : "0"}
          />
        </Field>
        <label className="flex h-9 items-center gap-2 text-sm">
          <Checkbox name="isSubcontractor" defaultChecked={vendor?.isSubcontractor ?? false} />
          Subcontractor
        </label>
      </div>
      <Field label="Notes" htmlFor="notes" error={errors.notes}>
        <Textarea id="notes" name="notes" rows={2} defaultValue={vendor?.notes ?? ""} />
      </Field>
    </>
  );
}

export function CreateVendorDialog() {
  return (
    <FormDialog
      title="Add vendor"
      description="Suppliers and subcontractors available for RFQs and purchase orders."
      action={createVendor}
      submitLabel="Add vendor"
      trigger={
        <Button size="sm">
          <Plus className="size-4" /> Add vendor
        </Button>
      }
    >
      {({ errors }) => <VendorFields errors={errors} />}
    </FormDialog>
  );
}

export function EditVendorDialog({ vendor }: { vendor: VendorInput }) {
  return (
    <FormDialog
      title={`Edit ${vendor.name}`}
      action={updateVendor}
      submitLabel="Save changes"
      trigger={
        <Button size="sm" variant="outline">
          <Pencil className="size-4" /> Edit vendor
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="vendorId" value={vendor.id} />
          <VendorFields errors={errors} vendor={vendor} />
        </>
      )}
    </FormDialog>
  );
}
