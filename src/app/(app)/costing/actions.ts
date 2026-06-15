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
  zMoney,
  type ActionState,
} from "@/lib/forms";
import { money } from "@/lib/money";

const manualCostSchema = z.object({
  projectId: z.string().uuid(),
  wbsId: z.string().uuid().optional(),
  type: z.enum(["budget", "commitment", "actual", "forecast"]),
  amount: zMoney,
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
