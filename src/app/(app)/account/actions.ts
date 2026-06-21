"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import * as t from "@/db/schema";
import { parseForm, ok, fail, type ActionState } from "@/lib/forms";

/* ─────────────────────────── change own password ──────────────────────────
 * Self-service password change for any signed-in user. The admin sets a
 * temporary password when provisioning the account (admin → Add user); this
 * lets the user rotate it themselves so the temp password doesn't live forever.
 */
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "Use at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password different from your current one",
  });

export async function changeOwnPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(changePasswordSchema, formData);
  if (!parsed.success)
    return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    const [u] = await tx
      .select({ passwordHash: t.users.passwordHash })
      .from(t.users)
      .where(eq(t.users.id, ctx.userId))
      .limit(1);
    if (!u) return fail("Account not found");
    if (!(await verifyPassword(u.passwordHash, d.currentPassword)))
      return fail("Your current password is incorrect", {
        currentPassword: "Incorrect password",
      });
    await tx
      .update(t.users)
      .set({ passwordHash: await hashPassword(d.newPassword), updatedAt: new Date() })
      .where(eq(t.users.id, ctx.userId));
    await audit(tx, ctx, {
      action: "user.password.change",
      entityType: "user",
      entityId: ctx.userId,
      summary: `${ctx.fullName} changed their own password`,
      risk: "warning",
    });
    return ok("Password changed");
  });
}
