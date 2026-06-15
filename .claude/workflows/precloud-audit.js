export const meta = {
  name: 'precloud-audit',
  description: 'Final pre-cloud audit: per-feature completeness/correctness/UX sweep, then verify real findings',
  phases: [
    { title: 'Audit', detail: 'one grounded auditor per feature area' },
    { title: 'Verify', detail: 'adversarially confirm each broken/incomplete/dead-end finding' },
  ],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['area', 'summary', 'items'],
  properties: {
    area: { type: 'string' },
    summary: { type: 'string', description: 'one-paragraph verdict on how complete/trustworthy this area is' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'kind', 'severity', 'evidence', 'userImpact', 'suggestedFix'],
        properties: {
          title: { type: 'string' },
          kind: { enum: ['broken', 'incomplete', 'deadend', 'polish'], description: 'broken=bug/wrong result; incomplete=create-without-edit/missing-delete/half-built; deadend=button/link goes nowhere or no way to reach a feature; polish=UI/UX refinement' },
          severity: { enum: ['high', 'medium', 'low'] },
          evidence: { type: 'string', description: 'file:line citations proving the claim — REQUIRED, no hand-waving' },
          userImpact: { type: 'string', description: 'what a real user trying to run their construction firm cannot do, or sees wrong' },
          suggestedFix: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['title', 'isReal', 'confidence', 'reasoning', 'corrected'],
  properties: {
    title: { type: 'string' },
    isReal: { type: 'boolean', description: 'true only if you independently confirmed the gap/bug exists in the code' },
    confidence: { enum: ['high', 'medium', 'low'] },
    reasoning: { type: 'string', description: 'what you checked in the code to confirm or refute' },
    corrected: { type: 'string', description: 'if the original claim was wrong or imprecise, the corrected statement; else empty' },
  },
}

const PREAMBLE = `You are auditing ConstructFlow, a local-first ERP for small construction firms, as a FINAL pass before it goes to cloud/production. Put yourself in the shoes of a real construction-firm owner using this daily.

Stack: Next.js 16 App Router + RSC, React 19, Drizzle ORM + Postgres (RLS-enforced tenant isolation via db(async (tx,ctx)=>...) in src/lib/auth/context.ts). Server actions return ActionState (ok/fail) from src/lib/forms.ts. UI uses shadcn-on-base-ui (render={<El/>} not asChild), Tailwind v4, a "Blueprint" design language (warm paper, hi-vis orange accent, Space Grotesk display font, mono eyebrows). RBAC via can(role, capability) from src/lib/rbac.ts. Money helpers in src/lib/money.ts.

Hunt for, in priority order:
1. INCOMPLETE features — a Create dialog with no Edit; a list with no delete/cancel; a field set on create but never editable (e.g. WBS budget); a status that can advance but never revert; data captured but never shown back.
2. DEAD ENDS — a button/link/tab that goes nowhere, an action with no UI to trigger it, a feature reachable by no navigation path, an empty state with no way out.
3. BROKEN — logic that produces a wrong result, a server action that can't succeed, a guard that's wrong, a query that omits data, RBAC gaps (user sees an action they can't perform or vice-versa).
4. POLISH — genuine UX/visual refinement that would make it feel crafted, not generic. Be selective; do not pad with nitpicks.

RULES:
- GROUND EVERY FINDING in code. Cite file:line. Open the files; do not guess.
- Trace the full flow: does the dialog's action exist, succeed, revalidate, and show the result back?
- Severity high = a real user is blocked or sees wrong money/data. medium = friction or a missing-but-expected capability. low = polish.
- Do NOT report: the deliberately-deferred "decimal/minor-unit money" item (known, accepted). Generic "add tests" advice. Speculative scale concerns.
- Return ONLY real, code-grounded findings. Quality over quantity. If the area is genuinely complete, say so and return few/no items.`

const AREAS = [
  { key: 'projects-planning', label: 'Projects & planning (list, detail, tasks, milestones, WBS budget editing, project edit)', files: 'src/app/(app)/projects/**, src/lib/queries.ts (getProjectCost, recompute), src/db/schema.ts (projects/tasks/milestones/wbsCodes/changeOrders)' },
  { key: 'requirements', label: 'Requirements & material coverage', files: 'src/app/(app)/requirements/**, getRequirementCoverage in src/lib/queries.ts' },
  { key: 'rfqs', label: 'RFQs, vendor quotes, multi-line, award→PO', files: 'src/app/(app)/rfqs/**' },
  { key: 'orders', label: 'Purchase orders lifecycle (draft/submit/approve/release/cancel/receive)', files: 'src/app/(app)/orders/**, src/lib/effects.ts' },
  { key: 'inventory-grn', label: 'Inventory, allocations, goods receipts (GRN) + reversal', files: 'src/app/(app)/inventory/**, src/app/(app)/receipts/**, src/app/(app)/allocations/**, src/app/(app)/deliveries/**' },
  { key: 'billing', label: 'Billing, invoices, milestone billing, payments', files: 'src/app/(app)/billing/**' },
  { key: 'costing', label: 'Costing pages & cost ledger / EAC forecast', files: 'src/app/(app)/costing/**, cost postings in src/lib/effects.ts and queries.ts' },
  { key: 'vendors', label: 'Vendors (list, detail, create/edit, performance)', files: 'src/app/(app)/vendors/**' },
  { key: 'approvals', label: 'Approvals queue & decision flow', files: 'src/app/(app)/approvals/**' },
  { key: 'dashboard', label: 'Dashboard / home & action items', files: 'src/app/(app)/dashboard/**, src/app/page.tsx, src/components/app/action-item-card.tsx' },
  { key: 'admin-auth', label: 'Admin, users, RBAC, auth (login/signup/session)', files: 'src/app/(app)/admin/**, src/app/(auth)/**, src/lib/auth/**, src/lib/rbac.ts' },
  { key: 'audit-attach-pdf', label: 'Audit log, attachments, printable PDFs', files: 'src/app/(app)/audit/**, src/app/attachments/**, src/app/print/**, src/components/app/attachments-panel.tsx, document-sheet.tsx' },
  { key: 'navigation-shell', label: 'Cross-cutting: app shell, navigation reachability, every nav link resolves, role-based menu, empty states, error/forbidden, loading/not-found', files: 'src/components/app/app-shell.tsx, src/app/(app)/layout.tsx, src/app/forbidden/**, all page.tsx route coverage vs nav' },
  { key: 'ui-consistency', label: 'Cross-cutting UI/UX craft: Blueprint design consistency, responsive/mobile, a11y, "de-AI-slop" — does it feel generic anywhere?', files: 'src/components/app/**, src/components/ui/**, src/app/globals.css; spot-check several pages' },
]

phase('Audit')
const reports = await pipeline(
  AREAS,
  (a) => agent(
    `${PREAMBLE}\n\nYOUR AREA: ${a.label}\nStart with these files (but follow imports/usages wherever needed): ${a.files}\n\nReturn structured findings for this area only.`,
    { label: `audit:${a.key}`, phase: 'Audit', schema: FINDINGS_SCHEMA }
  ),
  // Verify each non-polish finding in this area as soon as the area's audit lands.
  (report, area) => {
    if (!report) return { area: area.key, summary: '(audit failed)', items: [] }
    const toVerify = report.items.filter((i) => i.kind !== 'polish' && i.severity !== 'low')
    if (!toVerify.length) return report
    return parallel(
      toVerify.map((f) => () =>
        agent(
          `${PREAMBLE}\n\nA prior auditor claims the following gap/bug exists in ConstructFlow. Independently verify it by reading the cited code. Be adversarial: try to REFUTE it. Only mark isReal=true if you confirm it in the code.\n\nAREA: ${area.label}\nCLAIM: ${f.title}\nKIND: ${f.kind} / SEVERITY: ${f.severity}\nEVIDENCE CITED: ${f.evidence}\nCLAIMED USER IMPACT: ${f.userImpact}`,
          { label: `verify:${area.key}`, phase: 'Verify', schema: VERDICT_SCHEMA }
        ).then((v) => ({ ...f, verdict: v }))
      )
    ).then((verified) => ({
      ...report,
      items: [...report.items.filter((i) => i.kind === 'polish' || i.severity === 'low'), ...verified.filter(Boolean)],
    }))
  }
)

const confirmed = []
const polish = []
for (const r of reports.filter(Boolean)) {
  for (const it of r.items) {
    const row = { area: r.area, ...it }
    if (it.verdict) {
      if (it.verdict.isReal) confirmed.push(row)
    } else if (it.kind === 'polish' || it.severity === 'low') {
      polish.push(row)
    } else {
      confirmed.push(row) // unverified non-polish (e.g. verify slot dropped) — keep for human triage
    }
  }
}

log(`Confirmed real issues: ${confirmed.length} · polish ideas: ${polish.length}`)

return {
  summaries: reports.filter(Boolean).map((r) => ({ area: r.area, summary: r.summary })),
  confirmed: confirmed.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity])),
  polish,
}
