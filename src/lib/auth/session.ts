import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { sessions, users } from "@/db/schema";
import type { UserRole } from "@/db/schema";

const COOKIE = "cf_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type AuthContext = {
  userId: string;
  companyId: string;
  role: UserRole;
  fullName: string;
  email: string;
  title: string | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  companyId: string,
  userAgent?: string | null,
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000);
  await authDb.insert(sessions).values({
    userId,
    companyId,
    tokenHash: hashToken(token),
    userAgent: userAgent ?? null,
    expiresAt,
  });
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    await authDb.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(COOKIE);
}

/** Read + validate the session from the cookie. Returns null if missing/expired. */
export async function readSessionContext(): Promise<AuthContext | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const rows = await authDb
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      companyId: users.companyId,
      role: users.role,
      fullName: users.fullName,
      email: users.email,
      title: users.title,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await authDb.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }
  if (!row.isActive) return null;

  return {
    userId: row.userId,
    companyId: row.companyId,
    role: row.role,
    fullName: row.fullName,
    email: row.email,
    title: row.title,
  };
}
