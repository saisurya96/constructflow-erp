import "server-only";
import type { Tx } from "@/db/client";
import { auditEvents } from "@/db/schema";
import type { Severity } from "@/db/schema";
import type { AuthContext } from "@/lib/auth/session";

export type AuditInput = {
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  risk?: Severity;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
};

/** Append an immutable audit event. Call inside the same tenant transaction. */
export async function audit(
  tx: Tx,
  ctx: AuthContext,
  input: AuditInput,
): Promise<void> {
  await tx.insert(auditEvents).values({
    companyId: ctx.companyId,
    actorId: ctx.userId,
    actorName: ctx.fullName,
    action: input.action,
    summary: input.summary,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    risk: input.risk ?? "neutral",
    projectId: input.projectId ?? null,
    metadata: input.metadata ?? null,
  });
}
