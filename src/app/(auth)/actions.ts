"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authDb } from "@/db/client";
import { companies, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { parseForm, fail, type ActionState } from "@/lib/forms";

const signupSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  fullName: z.string().min(2, "Your name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "company"
  );
}

export async function signupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(signupSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const { companyName, fullName, email, password } = parsed.data;

  const existing = await authDb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (existing.length) {
    return fail("An account with this email already exists", {
      email: "Email already registered",
    });
  }

  // unique slug
  let slug = slugify(companyName);
  const taken = await authDb
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1);
  if (taken.length) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const [company] = await authDb
    .insert(companies)
    .values({ name: companyName, slug })
    .returning({ id: companies.id });

  const [user] = await authDb
    .insert(users)
    .values({
      companyId: company.id,
      email: email.toLowerCase(),
      fullName,
      passwordHash: await hashPassword(password),
      role: "admin",
      title: "Administrator",
    })
    .returning({ id: users.id });

  const ua = (await headers()).get("user-agent");
  await createSession(user.id, company.id, ua);
  redirect("/dashboard");
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const { email, password } = parsed.data;

  const rows = await authDb
    .select({
      id: users.id,
      companyId: users.companyId,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  const user = rows[0];
  if (!user || !user.isActive || !(await verifyPassword(user.passwordHash, password))) {
    return fail("Invalid email or password");
  }

  await authDb.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const ua = (await headers()).get("user-agent");
  await createSession(user.id, user.companyId, ua);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
