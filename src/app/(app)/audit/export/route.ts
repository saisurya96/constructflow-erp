import { desc, eq } from "drizzle-orm";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import type { Severity } from "@/db/schema";

const RISKS: Severity[] = ["critical", "warning", "good", "neutral"];
const MAX_ROWS = 5000;

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Download the (optionally risk-filtered) audit trail as CSV for an auditor. */
export async function GET(request: Request) {
  await requireCapability("audit.view");
  const url = new URL(request.url);
  const riskParam = url.searchParams.get("risk");
  const risk = RISKS.includes(riskParam as Severity) ? (riskParam as Severity) : null;

  const rows = await db(async (tx) =>
    tx
      .select({
        createdAt: t.auditEvents.createdAt,
        actorName: t.auditEvents.actorName,
        action: t.auditEvents.action,
        summary: t.auditEvents.summary,
        risk: t.auditEvents.risk,
        entityType: t.auditEvents.entityType,
        entityId: t.auditEvents.entityId,
        projectCode: t.projects.code,
      })
      .from(t.auditEvents)
      .leftJoin(t.projects, eq(t.auditEvents.projectId, t.projects.id))
      .where(risk ? eq(t.auditEvents.risk, risk) : undefined)
      .orderBy(desc(t.auditEvents.createdAt))
      .limit(MAX_ROWS),
  );

  const header = ["Time", "Actor", "Action", "Summary", "Risk", "Entity type", "Entity id", "Project"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt ? new Date(r.createdAt).toISOString() : "",
        r.actorName,
        r.action,
        r.summary,
        r.risk,
        r.entityType,
        r.entityId,
        r.projectCode,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const csv = lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-trail-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
