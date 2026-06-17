import { eq } from "drizzle-orm";
import { db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import * as t from "@/db/schema";
import { ATTACHMENT_READ_CAP } from "../caps";

/** Stream an attachment's bytes (RLS-scoped to the tenant + role-gated). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await db(async (tx, ctx) => {
    const [row] = await tx
      .select({
        fileName: t.attachments.fileName,
        mimeType: t.attachments.mimeType,
        data: t.attachments.data,
        entityType: t.attachments.entityType,
      })
      .from(t.attachments)
      .where(eq(t.attachments.id, id))
      .limit(1);
    if (!row || !row.data) return { status: 404, row: null };
    // Gate on the same capability that guards the owning module.
    const cap = ATTACHMENT_READ_CAP[row.entityType];
    if (cap && !can(ctx.role, cap)) return { status: 403, row: null };
    return { status: 200, row };
  });

  if (result.status === 403) return new Response("Forbidden", { status: 403 });
  if (result.status !== 200 || !result.row) {
    return new Response("Not found", { status: 404 });
  }

  const att = result.row;
  if (!att.data) return new Response("Not found", { status: 404 });
  const bytes = Buffer.from(att.data, "base64");
  const safeName = att.fileName.replace(/["\\\r\n]/g, "_");

  return new Response(bytes, {
    headers: {
      "Content-Type": att.mimeType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
    },
  });
}
