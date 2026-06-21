import { desc, eq } from "drizzle-orm";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import type { Severity } from "@/db/schema";

const RISKS: Severity[] = ["critical", "warning", "good", "neutral"];
const MAX_ROWS = 50000;

function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  // Neutralize spreadsheet formula injection: a cell an outsider can influence
  // (e.g. a vendor or project name) that begins with =, +, -, @, tab or CR is
  // executed as a formula by Excel/Sheets when the CSV is opened. Prefix with an
  // apostrophe so the value is always treated as text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
  // Don't truncate silently: if we hit the cap, say so in the file itself so an
  // auditor never mistakes a partial export for the complete trail.
  if (rows.length === MAX_ROWS) {
    lines.push(
      csvCell(
        `NOTE: export limited to the ${MAX_ROWS.toLocaleString("en")} most recent events. Filter by risk or date range for older records.`,
      ),
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
