"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authDb } from "@/db/client";
import { companies, users, warehouses, auditEvents } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, readSessionContext } from "@/lib/auth/session";
import { localeForCountry, CURRENCY_OPTIONS } from "@/lib/constants";
import { parseForm, fail, type ActionState } from "@/lib/forms";

const signupSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  fullName: z.string().min(2, "Your name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
  country: z.string().min(2).default("AE"),
  currencyCode: z.enum(CURRENCY_OPTIONS).optional(),
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
  const { companyName, fullName, email, password, country } = parsed.data;

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

  // Locale comes from the chosen country (currency + headline VAT), with the
  // currency overridable. No silent UAE default — all of this is editable later
  // under Admin → Company settings.
  const locale = localeForCountry(country);
  const currencyCode = parsed.data.currencyCode ?? locale.currency;

  const [company] = await authDb
    .insert(companies)
    .values({
      name: companyName,
      slug,
      country: locale.code,
      currencyCode,
      vatRate: locale.vat.toFixed(2),
    })
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

  // First-run setup: every firm needs at least one stores location to receive
  // goods against — provision one so the first goods-receipt isn't a dead end.
  await authDb.insert(warehouses).values({
    companyId: company.id,
    name: "Main Store",
    code: "WH-01",
    isActive: true,
  });

  // Seed the audit trail from the very first events (company + admin + store),
  // so the "complete audit trail" promise holds from minute zero.
  await authDb.insert(auditEvents).values([
    {
      companyId: company.id,
      actorId: user.id,
      actorName: fullName,
      action: "company.create",
      entityType: "company",
      entityId: company.id,
      summary: `Created company ${companyName} (${locale.code} · ${currencyCode})`,
      risk: "good",
    },
    {
      companyId: company.id,
      actorId: user.id,
      actorName: fullName,
      action: "user.create",
      entityType: "user",
      entityId: user.id,
      summary: `Provisioned founding administrator ${fullName}`,
      risk: "neutral",
    },
    {
      companyId: company.id,
      actorId: user.id,
      actorName: fullName,
      action: "warehouse.create",
      entityType: "warehouse",
      summary: "Provisioned default store “Main Store” (WH-01)",
      risk: "neutral",
    },
  ]);

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
      fullName: users.fullName,
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
  await authDb.insert(auditEvents).values({
    companyId: user.companyId,
    actorId: user.id,
    actorName: user.fullName,
    action: "user.login",
    entityType: "user",
    entityId: user.id,
    summary: `${user.fullName} signed in`,
    risk: "neutral",
  });
  const ua = (await headers()).get("user-agent");
  await createSession(user.id, user.companyId, ua);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  // Capture who is signing out before the session is torn down, so the audit
  // trail records the logout with proper attribution.
  const ctx = await readSessionContext();
  if (ctx) {
    await authDb.insert(auditEvents).values({
      companyId: ctx.companyId,
      actorId: ctx.userId,
      actorName: ctx.fullName,
      action: "user.logout",
      entityType: "user",
      entityId: ctx.userId,
      summary: `${ctx.fullName} signed out`,
      risk: "neutral",
    });
  }
  await destroySession();
  redirect("/login");
}
