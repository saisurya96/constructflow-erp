"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import * as t from "@/db/schema";
import { ROLE_LABELS } from "@/lib/rbac";
import {
  parseForm,
  ok,
  fail,
  type ActionState,
} from "@/lib/forms";

const ROLES = ["admin", "pm", "buyer", "storekeeper", "finance"] as const;
const zRole = z.enum(ROLES);

/* ───────────────────────────── users / team ───────────────────────────── */

const createUserSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Enter a valid email"),
  role: zRole,
  title: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function createUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(createUserSchema, formData);
  if (!parsed.success)
    return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "admin.manage")) return fail("You don't have permission");
    const passwordHash = await hashPassword(d.password);
    try {
      const [u] = await tx
        .insert(t.users)
        .values({
          companyId: ctx.companyId,
          email: d.email.toLowerCase(),
          fullName: d.fullName,
          passwordHash,
          role: d.role,
          title: d.title ?? null,
        })
        .returning();
      await audit(tx, ctx, {
        action: "user.create",
        entityType: "user",
        entityId: u.id,
        summary: `Added ${u.fullName} as ${ROLE_LABELS[u.role]}`,
        risk: "warning",
      });
      revalidatePath("/admin");
      return ok("User added");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/unique|duplicate|users_email_unique/i.test(message))
        return fail("Email already in use", { email: "Email already in use" });
      throw err;
    }
  });
}

const updateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: zRole,
});

export async function updateUserRole(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(updateRoleSchema, formData);
  if (!parsed.success) return fail("Invalid request");
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "admin.manage")) return fail("You don't have permission");
    const [u] = await tx
      .update(t.users)
      .set({ role: d.role, updatedAt: new Date() })
      .where(eq(t.users.id, d.userId))
      .returning();
    if (!u) return fail("User not found");
    await audit(tx, ctx, {
      action: "user.role",
      entityType: "user",
      entityId: u.id,
      summary: `Changed ${u.fullName}'s role to ${ROLE_LABELS[u.role]}`,
      risk: "warning",
    });
    revalidatePath("/admin");
    return ok("Role updated");
  });
}

const setActiveSchema = z.object({
  userId: z.string().uuid(),
  active: z.enum(["true", "false"]),
});

export async function setUserActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(setActiveSchema, formData);
  if (!parsed.success) return fail("Invalid request");
  const d = parsed.data;
  const active = d.active === "true";
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "admin.manage")) return fail("You don't have permission");
    if (d.userId === ctx.userId && !active)
      return fail("You cannot deactivate your own account");
    const [u] = await tx
      .update(t.users)
      .set({ isActive: active, updatedAt: new Date() })
      .where(eq(t.users.id, d.userId))
      .returning();
    if (!u) return fail("User not found");
    await audit(tx, ctx, {
      action: "user.active",
      entityType: "user",
      entityId: u.id,
      summary: `${active ? "Activated" : "Deactivated"} ${u.fullName}`,
      risk: "warning",
    });
    revalidatePath("/admin");
    return ok(active ? "User activated" : "User deactivated");
  });
}

const updateUserSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Enter a valid email"),
  title: z.string().optional(),
  phone: z.string().optional(),
});

export async function updateUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(updateUserSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "admin.manage")) return fail("You don't have permission");
    try {
      const [u] = await tx
        .update(t.users)
        .set({
          fullName: d.fullName,
          email: d.email.toLowerCase(),
          title: d.title ?? null,
          phone: d.phone ?? null,
          updatedAt: new Date(),
        })
        .where(eq(t.users.id, d.userId))
        .returning();
      if (!u) return fail("User not found");
      await audit(tx, ctx, {
        action: "user.update",
        entityType: "user",
        entityId: u.id,
        summary: `Updated ${u.fullName}'s profile`,
      });
      revalidatePath("/admin");
      return ok("User updated");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/unique|duplicate|users_email_unique/i.test(message))
        return fail("Email already in use", { email: "Email already in use" });
      throw err;
    }
  });
}

const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function resetUserPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(resetPasswordSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "admin.manage")) return fail("You don't have permission");
    const passwordHash = await hashPassword(d.password);
    const [u] = await tx
      .update(t.users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(t.users.id, d.userId))
      .returning();
    if (!u) return fail("User not found");
    await audit(tx, ctx, {
      action: "user.password.reset",
      entityType: "user",
      entityId: u.id,
      summary: `Reset password for ${u.fullName}`,
      risk: "warning",
    });
    revalidatePath("/admin");
    return ok(`Password reset for ${u.fullName} — share the new temporary password with them`);
  });
}

/* ─────────────────────────── company settings ─────────────────────────── */

const companySchema = z.object({
  name: z.string().min(2, "Company name is required"),
  currencyCode: z
    .string()
    .min(3, "Use a 3-letter currency code")
    .max(3, "Use a 3-letter currency code"),
  vatRate: z.coerce.number().min(0, "VAT rate cannot be negative").max(100),
  poApprovalThreshold: z.coerce.number().min(0, "Threshold cannot be negative"),
  address: z.string().optional(),
});

export async function updateCompany(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(companySchema, formData);
  if (!parsed.success)
    return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "admin.manage")) return fail("You don't have permission");
    // RLS scopes the update to the caller's own company row.
    const [c] = await tx
      .update(t.companies)
      .set({
        name: d.name,
        currencyCode: d.currencyCode.toUpperCase(),
        vatRate: (Math.round(d.vatRate * 100) / 100).toFixed(2),
        poApprovalThreshold: (Math.round(d.poApprovalThreshold * 100) / 100).toFixed(2),
        address: d.address ?? null,
        updatedAt: new Date(),
      })
      .where(eq(t.companies.id, ctx.companyId))
      .returning();
    if (!c) return fail("Company not found");
    await audit(tx, ctx, {
      action: "company.update",
      entityType: "company",
      entityId: c.id,
      summary: `Updated company settings for ${c.name}`,
      risk: "warning",
    });
    revalidatePath("/admin");
    return ok("Company settings saved");
  });
}
