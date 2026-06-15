"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import * as t from "@/db/schema";
import {
  parseForm,
  ok,
  fail,
  zSignedMoney,
  type ActionState,
} from "@/lib/forms";
import { money, num } from "@/lib/money";

const manualCostSchema = z.object({
  projectId: z.string().uuid(),
  wbsId: z.string().uuid().optional(),
  type: z.enum(["budget", "commitment", "actual"]),
  amount: zSignedMoney.refine((n) => n !== 0, "Amount can't be zero"),
  description: z.string().optional(),
});

/**
 * Finance-only manual cost ledger entry. Inserts a single cost_postings row and
 * audits it. Useful for budget adjustments, accruals or correcting actuals
 * outside the automated procurement/GRN flows.
 */
export async function postManualCost(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(manualCostSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "billing.manage"))
      return fail("You don't have permission");

    const [project] = await tx
      .select({ id: t.projects.id })
      .from(t.projects)
      .where(eq(t.projects.id, d.projectId))
      .limit(1);
    if (!project) return fail("Project not found");

    await tx.insert(t.costPostings).values({
      companyId: ctx.companyId,
      projectId: d.projectId,
      wbsId: d.wbsId ?? null,
      type: d.type,
      amount: money(d.amount),
      sourceType: "manual",
      sourceId: null,
      description: d.description ?? null,
      postedBy: ctx.userId,
    });

    await audit(tx, ctx, {
      action: "cost.post",
      entityType: "cost_posting",
      summary: `Posted manual ${d.type} of ${money(d.amount)}${d.description ? ` — ${d.description}` : ""}`,
      risk: "warning",
      projectId: d.projectId,
      metadata: { type: d.type, amount: money(d.amount) },
    });

    revalidatePath(`/costing/${d.projectId}`);
    revalidatePath("/costing");
    return ok("Cost posted");
  });
}

/**
 * Reverse a MANUAL cost posting by inserting an offsetting entry that references
 * the original, keeping the ledger immutable and the audit trail intact.
 * Automated postings (PO release, GRN, change order) are reversed by their own
 * flows (cancel / GRN-reversal), so we only allow reversing manual entries here.
 */
export async function reverseCostPosting(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const postingId = String(formData.get("postingId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "billing.manage")) return fail("You don't have permission");
    const [orig] = await tx
      .select()
      .from(t.costPostings)
      .where(eq(t.costPostings.id, postingId))
      .limit(1);
    if (!orig) return fail("Posting not found");
    if (orig.sourceType !== "manual")
      return fail("Only manual postings can be reversed here — cancel the source document instead");
    if (orig.description?.startsWith("Reversal of"))
      return fail("This entry is already a reversal");
    await tx.insert(t.costPostings).values({
      companyId: ctx.companyId,
      projectId: orig.projectId,
      wbsId: orig.wbsId,
      type: orig.type,
      amount: money(-num(orig.amount)),
      sourceType: "manual",
      sourceId: orig.id,
      description: `Reversal of ${orig.description ?? `${orig.type} posting`}`,
      postedBy: ctx.userId,
    });
    await audit(tx, ctx, {
      action: "cost.reverse",
      entityType: "cost_posting",
      entityId: orig.id,
      summary: `Reversed manual ${orig.type} of ${money(num(orig.amount))}`,
      risk: "warning",
      projectId,
      metadata: { type: orig.type, amount: money(num(orig.amount)) },
    });
    revalidatePath(`/costing/${projectId}`);
    revalidatePath("/costing");
    return ok("Posting reversed");
  });
}
