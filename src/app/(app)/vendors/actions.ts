"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ilike, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { VENDOR_CATEGORIES } from "@/lib/constants";
import * as t from "@/db/schema";
import { parseForm, ok, fail, type ActionState } from "@/lib/forms";

/** Round to 2 dp for the rating numeric(3,2) column, clamped 0–5. */
const rating = (n: number) =>
  (Math.round(Math.max(0, Math.min(5, n)) * 100) / 100).toFixed(2);

const vendorSchema = z.object({
  name: z.string().min(2, "Name is required"),
  code: z.string().optional(),
  category: z.enum(VENDOR_CATEGORIES).optional(),
  contactName: z.string().optional(),
  email: z.string().email("Enter a valid email").optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  isSubcontractor: z.literal("on").optional(),
  rating: z.coerce.number().min(0).max(5).default(0),
  notes: z.string().optional(),
});

export async function createVendor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(vendorSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "vendors.manage")) return fail("You don't have permission");
    // Guard against silent duplicates — the same vendor added twice splits its
    // spend/on-time history across rows. (Soft pre-check rather than a DB unique
    // index so existing tenants with legacy dups don't break.)
    if (d.code) {
      const [dupCode] = await tx
        .select({ id: t.vendors.id })
        .from(t.vendors)
        .where(ilike(t.vendors.code, d.code))
        .limit(1);
      if (dupCode)
        return fail("A vendor with this code already exists", { code: "Code already in use" });
    }
    const [dupName] = await tx
      .select({ id: t.vendors.id })
      .from(t.vendors)
      .where(ilike(t.vendors.name, d.name))
      .limit(1);
    if (dupName)
      return fail("A vendor with this name already exists", { name: "Name already in use" });
    const [vendor] = await tx
      .insert(t.vendors)
      .values({
        companyId: ctx.companyId,
        name: d.name,
        code: d.code ?? null,
        category: d.category ?? null,
        contactName: d.contactName ?? null,
        email: d.email ?? null,
        phone: d.phone ?? null,
        address: d.address ?? null,
        isSubcontractor: d.isSubcontractor === "on",
        rating: rating(d.rating),
        notes: d.notes ?? null,
      })
      .returning();
    await audit(tx, ctx, {
      action: "vendor.create",
      entityType: "vendor",
      entityId: vendor.id,
      summary: `Added vendor ${vendor.name}`,
    });
    revalidatePath("/vendors");
    return ok("Vendor added", `/vendors/${vendor.id}`);
  });
}

export async function updateVendor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const vendorId = String(formData.get("vendorId") ?? "");
  const parsed = parseForm(vendorSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "vendors.manage")) return fail("You don't have permission");
    // Reject a rename/recoding that collides with a different vendor.
    if (d.code) {
      const [dupCode] = await tx
        .select({ id: t.vendors.id })
        .from(t.vendors)
        .where(and(ilike(t.vendors.code, d.code), ne(t.vendors.id, vendorId)))
        .limit(1);
      if (dupCode)
        return fail("A vendor with this code already exists", { code: "Code already in use" });
    }
    const [dupName] = await tx
      .select({ id: t.vendors.id })
      .from(t.vendors)
      .where(and(ilike(t.vendors.name, d.name), ne(t.vendors.id, vendorId)))
      .limit(1);
    if (dupName)
      return fail("A vendor with this name already exists", { name: "Name already in use" });
    const [vendor] = await tx
      .update(t.vendors)
      .set({
        name: d.name,
        code: d.code ?? null,
        category: d.category ?? null,
        contactName: d.contactName ?? null,
        email: d.email ?? null,
        phone: d.phone ?? null,
        address: d.address ?? null,
        isSubcontractor: d.isSubcontractor === "on",
        rating: rating(d.rating),
        notes: d.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(t.vendors.id, vendorId))
      .returning();
    if (!vendor) return fail("Vendor not found");
    await audit(tx, ctx, {
      action: "vendor.update",
      entityType: "vendor",
      entityId: vendor.id,
      summary: `Updated vendor ${vendor.name}`,
    });
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${vendorId}`);
    return ok("Vendor updated");
  });
}

export async function setVendorActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const vendorId = String(formData.get("vendorId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "vendors.manage")) return fail("You don't have permission");
    const [vendor] = await tx
      .update(t.vendors)
      .set({ isActive: active, updatedAt: new Date() })
      .where(eq(t.vendors.id, vendorId))
      .returning();
    if (!vendor) return fail("Vendor not found");
    await audit(tx, ctx, {
      action: "vendor.active",
      entityType: "vendor",
      entityId: vendor.id,
      summary: `${active ? "Reactivated" : "Deactivated"} vendor ${vendor.name}`,
    });
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${vendorId}`);
    return ok(active ? "Vendor reactivated" : "Vendor deactivated");
  });
}
