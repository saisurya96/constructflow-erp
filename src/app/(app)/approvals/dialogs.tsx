"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/app/form-dialog";
import { Field } from "@/components/app/field";
import { decideApproval } from "./actions";

/** Reject an approval request with a required justification note. */
export function RejectDialog({
  approvalId,
  title,
}: {
  approvalId: string;
  title: string;
}) {
  return (
    <FormDialog
      title="Reject request"
      description={title}
      action={decideApproval}
      submitLabel="Reject"
      trigger={
        <Button size="xs" variant="outline" className="ml-1 text-critical">
          <X className="size-3.5" /> Reject
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="approvalId" value={approvalId} />
          <input type="hidden" name="decision" value="reject" />
          <Field
            label="Reason for rejection"
            htmlFor="note"
            error={errors.note}
            hint="Shared with the requester and recorded in the audit trail."
          >
            <Textarea
              id="note"
              name="note"
              rows={3}
              placeholder="e.g. Over budget — re-quote with at least three vendors."
            />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
