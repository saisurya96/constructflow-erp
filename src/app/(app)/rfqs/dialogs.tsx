"use client";

import { ClipboardEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/app/form-dialog";
import { Field, DateField } from "@/components/app/field";
import { enterQuote } from "./actions";

export function EnterQuoteDialog({
  quoteId,
  vendorName,
  defaults,
}: {
  quoteId: string;
  vendorName: string;
  defaults?: {
    totalAmount?: string;
    leadTimeDays?: string;
    deliveryDate?: string | null;
    technicalCompliance?: string;
    paymentTerms?: string | null;
  };
}) {
  const received = !!defaults;
  return (
    <FormDialog
      title={`${received ? "Edit" : "Enter"} quote — ${vendorName}`}
      description="Record this vendor's bid to bring it into the comparison."
      action={enterQuote}
      submitLabel={received ? "Update quote" : "Save quote"}
      trigger={
        <Button size="xs" variant={received ? "ghost" : "outline"}>
          <ClipboardEdit className="size-3.5" /> {received ? "Edit" : "Enter quote"}
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="quoteId" value={quoteId} />
          <Field label="Total amount" htmlFor="totalAmount" required error={errors.totalAmount}>
            <Input
              id="totalAmount"
              name="totalAmount"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={defaults?.totalAmount ?? ""}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lead time (days)" htmlFor="leadTimeDays" error={errors.leadTimeDays}>
              <Input
                id="leadTimeDays"
                name="leadTimeDays"
                type="number"
                min="0"
                defaultValue={defaults?.leadTimeDays ?? ""}
              />
            </Field>
            <Field label="Delivery date" htmlFor="deliveryDate" error={errors.deliveryDate}>
              <DateField name="deliveryDate" defaultValue={defaults?.deliveryDate ?? undefined} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Technical compliance %"
              htmlFor="technicalCompliance"
              error={errors.technicalCompliance}
            >
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
