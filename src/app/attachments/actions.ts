"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import * as t from "@/db/schema";
import { ok, fail, type ActionState } from "@/lib/forms";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — inline-in-DB storage

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

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");

  return db(async (tx, ctx) => {
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
