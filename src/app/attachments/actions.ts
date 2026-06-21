"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/auth/context";
import type { Tx } from "@/db/client";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import * as t from "@/db/schema";
import { ok, fail, type ActionState } from "@/lib/forms";
import { ATTACHMENT_WRITE_CAP } from "./caps";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — inline-in-DB storage

/**
 * Does the client-supplied attachment target actually exist in this tenant?
 * RLS bounds rows to the company, but the entityId is otherwise trusted — without
 * this a role could plant an attachment row against an arbitrary/foreign id.
 * Note: a `subcontract` is a purchase_orders row with type === "subcontract"
 * (there is no separate table).
 */
async function attachmentTargetExists(
  tx: Tx,
  entityType: string,
  entityId: string,
  companyId: string,
): Promise<boolean> {
  switch (entityType) {
    case "purchase_order":
    case "subcontract": {
      const [r] = await tx
        .select({ id: t.purchaseOrders.id })
        .from(t.purchaseOrders)
        .where(
          and(
            eq(t.purchaseOrders.id, entityId),
            eq(t.purchaseOrders.companyId, companyId),
            ...(entityType === "subcontract"
              ? [eq(t.purchaseOrders.type, "subcontract")]
              : []),
          ),
        )
        .limit(1);
      return !!r;
    }
    case "invoice": {
      const [r] = await tx
        .select({ id: t.invoices.id })
        .from(t.invoices)
        .where(and(eq(t.invoices.id, entityId), eq(t.invoices.companyId, companyId)))
        .limit(1);
      return !!r;
    }
    case "project": {
      const [r] = await tx
        .select({ id: t.projects.id })
        .from(t.projects)
        .where(and(eq(t.projects.id, entityId), eq(t.projects.companyId, companyId)))
        .limit(1);
      return !!r;
    }
    case "change_order": {
      const [r] = await tx
        .select({ id: t.changeOrders.id })
        .from(t.changeOrders)
        .where(and(eq(t.changeOrders.id, entityId), eq(t.changeOrders.companyId, companyId)))
        .limit(1);
      return !!r;
    }
    case "requirement": {
      const [r] = await tx
        .select({ id: t.projectRequirements.id })
        .from(t.projectRequirements)
        .where(
          and(
            eq(t.projectRequirements.id, entityId),
            eq(t.projectRequirements.companyId, companyId),
          ),
        )
        .limit(1);
      return !!r;
    }
    default:
      return false;
  }
}

/** Map an attachment's entityType to the detail route that should be revalidated. */
const ENTITY_PATH: Record<string, (id: string) => string> = {
  purchase_order: (id) => `/orders/${id}`,
  subcontract: (id) => `/orders/${id}`,
  invoice: (id) => `/billing/${id}`,
  project: (id) => `/projects/${id}`,
};
function revalidateEntity(entityType: string, entityId: string) {
  const path = ENTITY_PATH[entityType]?.(entityId);
  if (path) revalidatePath(path);
}

export async function uploadAttachment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const entityType = String(formData.get("entityType") ?? "").trim();
  const entityId = String(formData.get("entityId") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const file = formData.get("file");

  if (!entityType || !entityId) return fail("Missing entity reference");
  if (!(file instanceof File) || file.size === 0)
    return fail("Choose a file to upload");
  if (file.size > MAX_BYTES)
    return fail(`File is too large (max ${MAX_BYTES / 1024 / 1024} MB)`);

  const cap = ATTACHMENT_WRITE_CAP[entityType];
  if (!cap) return fail("Unsupported attachment target");

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");

  return db(async (tx, ctx) => {
    // Write gating is symmetric with the download route — a role can only attach
    // to entities it can manage, so view-only roles can't plant files.
    if (!can(ctx.role, cap)) return fail("You don't have permission to attach files here");

    // Resolve the target against its owning table before storing the file.
    if (!(await attachmentTargetExists(tx, entityType, entityId, ctx.companyId)))
      return fail("Attachment target not found");

    await tx.insert(t.attachments).values({
      companyId: ctx.companyId,
      entityType,
      entityId,
      fileName: file.name || "file",
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      storageKey: randomUUID(),
      data,
      description: description || null,
      uploadedBy: ctx.userId,
    });

    await audit(tx, ctx, {
      action: "attachment.upload",
      entityType,
      entityId,
      summary: `Uploaded "${file.name}"`,
    });

    revalidateEntity(entityType, entityId);
    return ok("File uploaded");
  });
}

export async function deleteAttachment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const attachmentId = String(formData.get("attachmentId") ?? "").trim();
  if (!attachmentId) return fail("Missing attachment");

  return db(async (tx, ctx) => {
    const [att] = await tx
      .select()
      .from(t.attachments)
      .where(eq(t.attachments.id, attachmentId))
      .limit(1);
    if (!att) return fail("Attachment not found");
    // Only the uploader or an admin may delete.
    if (att.uploadedBy !== ctx.userId && !can(ctx.role, "admin.manage"))
      return fail("Only the uploader or an admin can remove this file");

    await tx
      .delete(t.attachments)
      .where(
        and(
          eq(t.attachments.id, attachmentId),
          eq(t.attachments.companyId, ctx.companyId),
        ),
      );

    await audit(tx, ctx, {
      action: "attachment.delete",
      entityType: att.entityType,
      entityId: att.entityId,
      summary: `Removed "${att.fileName}"`,
      risk: "warning",
    });

    revalidateEntity(att.entityType, att.entityId);
    return ok("File removed");
  });
}
