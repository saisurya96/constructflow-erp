"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, CreditCard, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/app/form-dialog";
import { Field, DateField, NativeSelect } from "@/components/app/field";
import { createInvoice, recordPayment, editInvoice } from "./actions";

type Option = { id: string; label: string };
type MilestoneOption = { id: string; label: string; amount: number };

export type ProjectOption = {
  id: string;
  label: string;
  wbs: Option[];
  milestones: MilestoneOption[];
};

/* ───────────────────────────── create invoice ───────────────────────────── */

type LineRow = { key: number; description: string; amount: string; wbsId: string };

export function CreateInvoiceDialog({
  projects,
}: {
  projects: ProjectOption[];
}) {
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");
  const [type, setType] = useState<"milestone" | "progress">("progress");
  const [milestoneId, setMilestoneId] = useState<string>("");
  const [lines, setLines] = useState<LineRow[]>([
    { key: 1, description: "", amount: "", wbsId: "" },
  ]);

  const project = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  );
  const wbsOptions = project?.wbs ?? [];
  const milestoneOptions = project?.milestones ?? [];

  const addLine = () =>
    setLines((rows) => [
      ...rows,
      { key: (rows.at(-1)?.key ?? 0) + 1, description: "", amount: "", wbsId: "" },
    ]);
  const removeLine = (key: number) =>
    setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));
  const setLine = (key: number, patch: Partial<LineRow>) =>
    setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const subtotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  // When picking a milestone, prefill a single line with its billing amount.
  const onPickMilestone = (id: string) => {
    setMilestoneId(id);
    const ms = milestoneOptions.find((m) => m.id === id);
    if (ms) {
      setLines([
        { key: 1, description: ms.label, amount: ms.amount ? String(ms.amount) : "", wbsId: "" },
      ]);
    }
  };

  return (
    <FormDialog
      title="New invoice"
      description="Tax is applied at the company VAT rate. Save creates a draft you can send."
      action={createInvoice}
      submitLabel="Create invoice"
      className="sm:max-w-2xl"
      trigger={
        <Button size="sm">
          <Plus className="size-4" /> New invoice
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project" htmlFor="projectId" required error={errors.projectId}>
              <NativeSelect
                id="projectId"
                name="projectId"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.currentTarget.value);
                  setMilestoneId("");
                }}
              >
                <option value="">— select —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Type" htmlFor="type" required error={errors.type}>
              <NativeSelect
                id="type"
                name="type"
                value={type}
                onChange={(e) => setType(e.currentTarget.value as "milestone" | "progress")}
              >
                <option value="progress">Progress</option>
                <option value="milestone">Milestone</option>
              </NativeSelect>
            </Field>
          </div>

          <Field label="Title" htmlFor="title" required error={errors.title}>
            <Input id="title" name="title" required placeholder="Progress application #3" />
          </Field>

          {type === "milestone" ? (
            <Field label="Milestone" htmlFor="milestoneId" required error={errors.milestoneId}>
              <NativeSelect
                id="milestoneId"
                name="milestoneId"
                value={milestoneId}
                onChange={(e) => onPickMilestone(e.currentTarget.value)}
              >
                <option value="">— select milestone —</option>
                {milestoneOptions.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </NativeSelect>
            </Field>
          ) : (
            <Field label="Progress %" htmlFor="progressPercent" error={errors.progressPercent}>
              <Input
                id="progressPercent"
                name="progressPercent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="e.g. 35"
              />
            </Field>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Line items</span>
              <Button type="button" size="xs" variant="outline" onClick={addLine}>
                <Plus className="size-3.5" /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="grid grid-cols-[1fr_7rem_auto] items-start gap-2">
                  <div className="space-y-2">
                    <Input
                      name="lineDesc"
                      placeholder="Description"
                      value={l.description}
                      onChange={(e) => setLine(l.key, { description: e.currentTarget.value })}
                    />
                    <NativeSelect
                      name="lineWbs"
                      value={l.wbsId}
                      className="h-8 text-xs"
                      onChange={(e) => setLine(l.key, { wbsId: e.currentTarget.value })}
                    >
                      <option value="">— cost code —</option>
                      {wbsOptions.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </NativeSelect>
                  </div>
                  <Input
                    name="lineAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="tabular"
                    value={l.amount}
                    onChange={(e) => setLine(l.key, { amount: e.currentTarget.value })}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeLine(l.key)}
                    aria-label="Remove line"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-1 text-sm text-muted-foreground tabular">
              Subtotal {new Intl.NumberFormat("en-AE", {
                style: "currency",
                currency: "AED",
                maximumFractionDigits: 0,
              }).format(subtotal)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Issue date" htmlFor="issueDate" error={errors.issueDate}>
              <DateField name="issueDate" />
            </Field>
            <Field label="Due date" htmlFor="dueDate" error={errors.dueDate}>
              <DateField name="dueDate" />
            </Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}

/* ───────────────────────────── edit draft invoice ───────────────────────── */

export function EditInvoiceDialog({
  invoiceId,
  type,
  wbsOptions,
  defaults,
  lines: initialLines,
}: {
  invoiceId: string;
  type: "milestone" | "progress";
  wbsOptions: Option[];
  defaults: { title: string; progressPercent: string | null; issueDate: string | null; dueDate: string | null };
  lines: { description: string; amount: string; wbsId: string }[];
}) {
  const [lines, setLines] = useState<LineRow[]>(
    initialLines.length
      ? initialLines.map((l, i) => ({ key: i + 1, description: l.description, amount: l.amount, wbsId: l.wbsId }))
      : [{ key: 1, description: "", amount: "", wbsId: "" }],
  );
  const addLine = () =>
    setLines((rows) => [...rows, { key: (rows.at(-1)?.key ?? 0) + 1, description: "", amount: "", wbsId: "" }]);
  const removeLine = (key: number) =>
    setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));
  const setLine = (key: number, patch: Partial<LineRow>) =>
    setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const subtotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  return (
    <FormDialog
      title="Edit draft invoice"
      action={editInvoice}
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
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <Field label="Title" htmlFor="title" required error={errors.title}>
            <Input id="title" name="title" required defaultValue={defaults.title} />
          </Field>
          {type === "progress" && (
            <Field label="Progress %" htmlFor="progressPercent" error={errors.progressPercent}>
              <Input
                id="progressPercent"
                name="progressPercent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                defaultValue={defaults.progressPercent ?? ""}
              />
            </Field>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Line items</span>
              <Button type="button" size="xs" variant="outline" onClick={addLine}>
                <Plus className="size-3.5" /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="grid grid-cols-[1fr_7rem_auto] items-start gap-2">
                  <div className="space-y-2">
                    <Input
                      name="lineDesc"
                      placeholder="Description"
                      value={l.description}
                      onChange={(e) => setLine(l.key, { description: e.currentTarget.value })}
                    />
                    <NativeSelect
                      name="lineWbs"
                      value={l.wbsId}
                      className="h-8 text-xs"
                      onChange={(e) => setLine(l.key, { wbsId: e.currentTarget.value })}
                    >
                      <option value="">— cost code —</option>
                      {wbsOptions.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </NativeSelect>
                  </div>
                  <Input
                    name="lineAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="tabular"
                    value={l.amount}
                    onChange={(e) => setLine(l.key, { amount: e.currentTarget.value })}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeLine(l.key)}
                    aria-label="Remove line"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-1 text-sm text-muted-foreground tabular">
              Subtotal {new Intl.NumberFormat("en-AE", {
                style: "currency",
                currency: "AED",
                maximumFractionDigits: 0,
              }).format(subtotal)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issue date" htmlFor="issueDate" error={errors.issueDate}>
              <DateField name="issueDate" defaultValue={defaults.issueDate ?? undefined} />
            </Field>
            <Field label="Due date" htmlFor="dueDate" error={errors.dueDate}>
              <DateField name="dueDate" defaultValue={defaults.dueDate ?? undefined} />
            </Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}

/* ───────────────────────────── record payment ───────────────────────────── */

export function RecordPaymentDialog({
  invoiceId,
  outstanding,
}: {
  invoiceId: string;
  outstanding: number;
}) {
  return (
    <FormDialog
      title="Record payment"
      description="Logs a receipt against this invoice and updates its paid status."
      action={recordPayment}
      submitLabel="Record payment"
      trigger={
        <Button size="sm">
          <CreditCard className="size-4" /> Record payment
        </Button>
      }
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" htmlFor="amount" required error={errors.amount}>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={outstanding > 0 ? outstanding.toFixed(2) : ""}
              />
            </Field>
            <Field label="Paid date" htmlFor="paidDate" required error={errors.paidDate}>
              <DateField name="paidDate" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method" htmlFor="method" error={errors.method}>
              <NativeSelect id="method" name="method" defaultValue="">
                <option value="">— select —</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
              </NativeSelect>
            </Field>
            <Field label="Reference" htmlFor="reference" error={errors.reference}>
              <Input id="reference" name="reference" placeholder="TT / cheque no." />
            </Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}
