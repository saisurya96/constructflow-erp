/**
 * Seed a rich demo tenant ("Buildwell Contracting") spanning the whole spine —
 * project → schedule → requirement → RFQ → PO → GRN → stock → allocation →
 * cost → change order → invoice — plus a second tenant ("Skyline Builders")
 * that exists only to demonstrate RLS isolation.
 *
 * Connects via the BYPASSRLS role so it can write across both tenants.
 * Run with: npm run db:seed   (idempotent: wipes the demo tenants first)
 */
import "dotenv/config";
import postgres from "postgres";
import { pgOptions } from "./pg-options";
import { drizzle } from "drizzle-orm/postgres-js";
import { inArray } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import * as s from "./schema";
import { DEFAULT_WBS_TEMPLATE } from "../lib/constants";
import { formatMoney, num } from "../lib/money";
import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  DEMO_COMPANY,
  DEMO_COMPANY_B,
} from "../lib/demo";

const DAY = 86_400_000;
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const m = (n: number) => n.toFixed(2);
const q = (n: number) => n.toFixed(3);

async function main() {
  const url = process.env.AUTH_DATABASE_URL;
  if (!url) throw new Error("AUTH_DATABASE_URL is not set");
  const sql = postgres(url, { ...pgOptions(url), max: 1 });
  const db = drizzle(sql, { schema: s });

  console.log("→ clearing demo tenants…");
  await db
    .delete(s.companies)
    .where(inArray(s.companies.slug, [DEMO_COMPANY.slug, DEMO_COMPANY_B.slug]));

  const pw = await hash(DEMO_PASSWORD, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });

  /* ─────────────────────────── company + users ─────────────────────────── */
  console.log("→ company + users…");
  const [co] = await db
    .insert(s.companies)
    .values({
      name: DEMO_COMPANY.name,
      slug: DEMO_COMPANY.slug,
      currencyCode: "AED",
      vatRate: "5.00",
      country: "AE",
      address: "Business Bay, Dubai, UAE",
      poApprovalThreshold: m(50000),
    })
    .returning();

  const users: Record<string, string> = {};
  for (const a of DEMO_ACCOUNTS) {
    const [u] = await db
      .insert(s.users)
      .values({
        companyId: co.id,
        email: a.email,
        fullName: a.fullName,
        passwordHash: pw,
        role: a.role,
        title: a.label,
      })
      .returning();
    users[a.role] = u.id;
  }
  const { pm, buyer, storekeeper, finance } = users;

  /* ─────────────────────────────── vendors ─────────────────────────────── */
  console.log("→ vendors…");
  const vendorDefs = [
    { name: "Emirates Steel Industries", category: "Steel & Rebar", rating: "4.6", onTime: "92", defect: "1.2", spend: 0, sub: false },
    { name: "Gulf Ready-Mix LLC", category: "Concrete & Aggregates", rating: "4.2", onTime: "88", defect: "2.1", spend: 0, sub: false },
    { name: "Al Noor Electrical Trading", category: "Electrical", rating: "4.4", onTime: "90", defect: "1.5", spend: 0, sub: false },
    { name: "Falcon MEP Supplies", category: "Plumbing & MEP", rating: "3.9", onTime: "81", defect: "3.0", spend: 0, sub: false },
    { name: "Desert Finishes Co.", category: "Finishes", rating: "4.1", onTime: "85", defect: "2.4", spend: 0, sub: false },
    { name: "Pinnacle Subcontractors", category: "Subcontractor", rating: "4.3", onTime: "87", defect: "1.8", spend: 0, sub: true },
    { name: "Metro Rebar Trading", category: "Steel & Rebar", rating: "3.7", onTime: "74", defect: "3.6", spend: 0, sub: false },
  ];
  const vendors: Record<string, string> = {};
  for (const v of vendorDefs) {
    const [row] = await db
      .insert(s.vendors)
      .values({
        companyId: co.id,
        name: v.name,
        category: v.category,
        rating: v.rating,
        onTimeRate: v.onTime,
        defectRate: v.defect,
        isSubcontractor: v.sub,
        contactName: "Sales Desk",
        email: `sales@${v.name.toLowerCase().replace(/[^a-z]+/g, "")}.ae`,
        phone: "+971 4 000 0000",
        totalSpend: m(v.spend),
      })
      .returning();
    vendors[v.name] = row.id;
  }

  /* ────────────────────────────── warehouses ───────────────────────────── */
  const [mainStore] = await db
    .insert(s.warehouses)
    .values({ companyId: co.id, name: "Main Site Store", code: "WH-01" })
    .returning();
  await db
    .insert(s.warehouses)
    .values({ companyId: co.id, name: "Central Yard", code: "WH-02" });

  /* ─────────────────────────────── projects ────────────────────────────── */
  console.log("→ projects + WBS + schedule…");
  const projectDefs = [
    { code: "PRJ-001", name: "Marina Heights Tower", client: "Marina Development LLC", location: "Dubai Marina", status: "active" as const, budget: 12_000_000, contract: 14_500_000, progress: 38, start: -120, end: 240 },
    { code: "PRJ-002", name: "Al Barsha Clinic Fit-out", client: "Wellness Group", location: "Al Barsha, Dubai", status: "active" as const, budget: 3_200_000, contract: 3_850_000, progress: 64, start: -90, end: 60 },
    { code: "PRJ-003", name: "Jebel Ali Warehouse", client: "Logistixx FZE", location: "Jebel Ali Free Zone", status: "planning" as const, budget: 5_500_000, contract: 6_400_000, progress: 5, start: 14, end: 320 },
  ];
  const projects: Record<string, string> = {};
  for (const p of projectDefs) {
    const [row] = await db
      .insert(s.projects)
      .values({
        companyId: co.id,
        code: p.code,
        name: p.name,
        clientName: p.client,
        location: p.location,
        status: p.status,
        startDate: iso(p.start),
        endDate: iso(p.end),
        budget: m(p.budget),
        contractValue: m(p.contract),
        progress: String(p.progress),
        createdBy: pm,
      })
      .returning();
    projects[p.code] = row.id;
    // project team
    for (const uid of [pm, buyer, storekeeper, finance]) {
      await db.insert(s.projectMembers).values({
        companyId: co.id,
        projectId: row.id,
        userId: uid,
        roleOnProject: uid === pm ? "Project Manager" : "Team",
      });
    }
  }

  // WBS for all projects, capturing PRJ-001 codes for linking
  const wbsByProjectCode: Record<string, Record<string, string>> = {};
  for (const p of projectDefs) {
    const map: Record<string, string> = {};
    let order = 0;
    const projBudget = p.budget;
    const weights = [0.08, 0.18, 0.3, 0.12, 0.14, 0.12, 0.04, 0.02];
    for (const w of DEFAULT_WBS_TEMPLATE) {
      const [row] = await db
        .insert(s.wbsCodes)
        .values({
          companyId: co.id,
          projectId: projects[p.code],
          code: w.code,
          name: w.name,
          budget: m(Math.round(projBudget * (weights[order] ?? 0.05))),
          sortOrder: order,
        })
        .returning();
      map[w.code] = row.id;
      order += 1;
    }
    wbsByProjectCode[p.code] = map;
  }

  const p1 = projects["PRJ-001"];
  const wbs1 = wbsByProjectCode["PRJ-001"];

  /* ─── schedule for PRJ-001 ─── */
  const taskDefs = [
    { name: "Site mobilization & setup", wbs: "1.0", status: "done" as const, progress: 100, start: -120, due: -100, blocked: false },
    { name: "Excavation & shoring", wbs: "2.0", status: "done" as const, progress: 100, start: -100, due: -70, blocked: false },
    { name: "Raft foundation & pile caps", wbs: "2.0", status: "in_progress" as const, progress: 70, start: -70, due: 10, blocked: false },
    { name: "Basement RC slab pour", wbs: "2.0", status: "blocked" as const, progress: 15, start: -10, due: 25, blocked: true },
    { name: "Core wall construction (L1–L10)", wbs: "3.0", status: "in_progress" as const, progress: 30, start: 0, due: 120, blocked: false },
    { name: "MEP first fix — basement", wbs: "6.0", status: "not_started" as const, progress: 0, start: 20, due: 90, blocked: false },
    { name: "Internal blockwork", wbs: "5.0", status: "not_started" as const, progress: 0, start: 60, due: 160, blocked: false },
  ];
  const tasks: string[] = [];
  let tOrder = 0;
  for (const t of taskDefs) {
    const [row] = await db
      .insert(s.tasks)
      .values({
        companyId: co.id,
        projectId: p1,
        wbsId: wbs1[t.wbs],
        name: t.name,
        status: t.status,
        progress: String(t.progress),
        startDate: iso(t.start),
        dueDate: iso(t.due),
        assigneeId: pm,
        isBlocked: t.blocked,
        sortOrder: tOrder++,
      })
      .returning();
    tasks.push(row.id);
  }
  const taskFoundation = tasks[2]; // raft foundation
  const taskSlab = tasks[3]; // blocked basement slab
  const taskCore = tasks[4];

  // milestones for PRJ-001
  const milestoneDefs = [
    { name: "Foundation complete", due: 15, amount: 2_175_000, pct: 15, status: "pending" as const },
    { name: "Structure topped out (L20)", due: 130, amount: 4_350_000, pct: 30, status: "pending" as const },
    { name: "MEP & finishes complete", due: 210, amount: 5_075_000, pct: 35, status: "pending" as const },
    { name: "Handover", due: 240, amount: 2_900_000, pct: 20, status: "pending" as const },
  ];
  const milestones: string[] = [];
  let msOrder = 0;
  for (const ms of milestoneDefs) {
    const [row] = await db
      .insert(s.milestones)
      .values({
        companyId: co.id,
        projectId: p1,
        name: ms.name,
        dueDate: iso(ms.due),
        billingAmount: m(ms.amount),
        billingPercent: String(ms.pct),
        status: ms.status,
        sortOrder: msOrder++,
      })
      .returning();
    milestones.push(row.id);
  }

  /* ─────────────────── requirements (material needs) ───────────────────── */
  console.log("→ requirements + procurement loop…");
  const reqDefs = [
    { item: "Reinforcement steel Y16", unit: "ton", qty: 45, task: taskFoundation, wbs: "2.0", needed: 5, est: 2800, status: "partially_received" as const },
    { item: "Ready-mix concrete C40", unit: "m3", qty: 600, task: taskSlab, wbs: "2.0", needed: -2, est: 320, status: "sourcing" as const },
    { item: "Cement OPC 50kg bags", unit: "bag", qty: 1200, task: taskCore, wbs: "3.0", needed: 30, est: 18, status: "fulfilled" as const },
    { item: "MEP cable trays 300mm", unit: "m", qty: 800, task: tasks[5], wbs: "6.0", needed: 45, est: 65, status: "submitted" as const },
    { item: "AAC blocks 200mm", unit: "pcs", qty: 9000, task: tasks[6], wbs: "5.0", needed: 90, est: 6.5, status: "draft" as const },
  ];
  const reqs: Record<string, string> = {};
  for (const r of reqDefs) {
    const [row] = await db
      .insert(s.projectRequirements)
      .values({
        companyId: co.id,
        projectId: p1,
        taskId: r.task,
        wbsId: wbs1[r.wbs],
        itemName: r.item,
        unit: r.unit,
        quantity: q(r.qty),
        neededBy: iso(r.needed),
        estimatedUnitCost: m(r.est),
        status: r.status,
        requestedBy: pm,
      })
      .returning();
    reqs[r.item] = row.id;
  }

  const auditRows: (typeof s.auditEvents.$inferInsert)[] = [];
  const costRows: (typeof s.costPostings.$inferInsert)[] = [];
  const postBudget = () => {
    for (const [code, wid] of Object.entries(wbs1)) {
      const def = DEFAULT_WBS_TEMPLATE.find((w) => w.code === code);
      costRows.push({
        companyId: co.id,
        projectId: p1,
        wbsId: wid,
        type: "budget",
        amount: m(0), // budget tracked on wbs row; ledger budget rows optional
        sourceType: "wbs",
        description: `Budget — ${def?.name ?? code}`,
        postedBy: finance,
      });
    }
  };
  postBudget();

  /* ─── RFQ-0001 for the steel requirement (awarded → PO-0001) ─── */
  const [rfq1] = await db
    .insert(s.rfqs)
    .values({
      companyId: co.id,
      number: "RFQ-0001",
      projectId: p1,
      title: "Reinforcement steel Y16 — 45 ton",
      status: "awarded",
      dueDate: iso(-12),
      createdBy: buyer,
    })
    .returning();
  const [rfq1Line] = await db
    .insert(s.rfqLines)
    .values({
      companyId: co.id,
      rfqId: rfq1.id,
      requirementId: reqs["Reinforcement steel Y16"],
      itemName: "Reinforcement steel Y16",
      unit: "ton",
      quantity: q(45),
      sortOrder: 0,
    })
    .returning();

  const quoteDefs = [
    { vendor: "Emirates Steel Industries", price: 2750, lead: 10, compliance: 95, award: true, deliver: -8 },
    { vendor: "Metro Rebar Trading", price: 2700, lead: 21, compliance: 84, award: false, deliver: 4 },
    { vendor: "Gulf Ready-Mix LLC", price: 2840, lead: 7, compliance: 90, award: false, deliver: -10 },
  ];
  let awardedQuoteId = "";
  for (const qd of quoteDefs) {
    await db.insert(s.rfqVendors).values({
      companyId: co.id,
      rfqId: rfq1.id,
      vendorId: vendors[qd.vendor],
    });
    const total = qd.price * 45;
    const [quote] = await db
      .insert(s.vendorQuotes)
      .values({
        companyId: co.id,
        rfqId: rfq1.id,
        vendorId: vendors[qd.vendor],
        status: qd.award ? "awarded" : "received",
        leadTimeDays: qd.lead,
        deliveryDate: iso(qd.deliver),
        paymentTerms: "30 days",
        technicalCompliance: String(qd.compliance),
        totalAmount: m(total),
        submittedAt: iso(-13),
      })
      .returning();
    await db.insert(s.vendorQuoteLines).values({
      companyId: co.id,
      quoteId: quote.id,
      rfqLineId: rfq1Line.id,
      unitPrice: m(qd.price),
      lineTotal: m(total),
    });
    if (qd.award) awardedQuoteId = quote.id;
  }
  await db
    .update(s.rfqs)
    .set({ awardedQuoteId })
    .where(inArray(s.rfqs.id, [rfq1.id]));

  /* ─── PO-0001 (steel) — released, partially received ─── */
  const steelSub = 2750 * 45;
  const steelTax = steelSub * 0.05;
  const [po1] = await db
    .insert(s.purchaseOrders)
    .values({
      companyId: co.id,
      number: "PO-0001",
      type: "purchase_order",
      projectId: p1,
      vendorId: vendors["Emirates Steel Industries"],
      rfqId: rfq1.id,
      quoteId: awardedQuoteId,
      title: "Reinforcement steel Y16 — 45 ton",
      status: "partially_received",
      subtotal: m(steelSub),
      taxAmount: m(steelTax),
      totalAmount: m(steelSub + steelTax),
      expectedDate: iso(-2),
      paymentTerms: "30 days",
      createdBy: buyer,
      approvedBy: finance,
      approvedAt: new Date(Date.now() - 9 * DAY),
      releasedAt: new Date(Date.now() - 8 * DAY),
    })
    .returning();
  const [po1Line] = await db
    .insert(s.purchaseOrderLines)
    .values({
      companyId: co.id,
      poId: po1.id,
      requirementId: reqs["Reinforcement steel Y16"],
      wbsId: wbs1["2.0"],
      itemName: "Reinforcement steel Y16",
      unit: "ton",
      quantity: q(45),
      unitPrice: m(2750),
      lineTotal: m(steelSub),
      receivedQty: q(30),
      sortOrder: 0,
    })
    .returning();
  // commitment on release, then move 30t worth committed→actual at GRN
  costRows.push({ companyId: co.id, projectId: p1, wbsId: wbs1["2.0"], type: "commitment", amount: m(steelSub), sourceType: "po", sourceId: po1.id, description: "PO-0001 Emirates Steel — committed", postedBy: buyer });
  costRows.push({ companyId: co.id, projectId: p1, wbsId: wbs1["2.0"], type: "commitment", amount: m(-(2750 * 30)), sourceType: "grn", description: "GRN-0001 received — commitment relieved", postedBy: storekeeper });
  costRows.push({ companyId: co.id, projectId: p1, wbsId: wbs1["2.0"], type: "actual", amount: m(2750 * 30), sourceType: "grn", description: "GRN-0001 received — 30 ton steel", postedBy: storekeeper });

  /* ─── GRN-0001 (steel, 30 of 45 ton) → inventory + movement ─── */
  const [grn1] = await db
    .insert(s.goodsReceipts)
    .values({
      companyId: co.id,
      number: "GRN-0001",
      poId: po1.id,
      vendorId: vendors["Emirates Steel Industries"],
      projectId: p1,
      warehouseId: mainStore.id,
      deliveryNoteNumber: "DN-ESI-4471",
      receivedDate: iso(-2),
      status: "posted",
      receivedBy: storekeeper,
    })
    .returning();
  await db.insert(s.goodsReceiptLines).values({
    companyId: co.id,
    grnId: grn1.id,
    poLineId: po1Line.id,
    itemName: "Reinforcement steel Y16",
    unit: "ton",
    orderedQty: q(45),
    receivedQty: q(30),
    acceptedQty: q(30),
    condition: "good",
    unitCost: m(2750),
  });
  const [steelStock] = await db
    .insert(s.inventoryItems)
    .values({
      companyId: co.id,
      warehouseId: mainStore.id,
      itemName: "Reinforcement steel Y16",
      unit: "ton",
      quantity: q(30),
      allocatedQty: q(25),
      unitCost: m(2750),
      reorderPoint: q(10),
    })
    .returning();
  await db.insert(s.inventoryMovements).values({
    companyId: co.id,
    itemId: steelStock.id,
    type: "receipt",
    quantity: q(30),
    unitCost: m(2750),
    referenceType: "grn",
    referenceId: grn1.id,
    projectId: p1,
    notes: "GRN-0001 from Emirates Steel",
    performedBy: storekeeper,
  });
  // allocate 25 ton to the foundation task (clears its block)
  await db.insert(s.inventoryAllocations).values({
    companyId: co.id,
    itemId: steelStock.id,
    projectId: p1,
    taskId: taskFoundation,
    requirementId: reqs["Reinforcement steel Y16"],
    wbsId: wbs1["2.0"],
    quantity: q(25),
    status: "reserved",
    allocatedBy: storekeeper,
  });

  /* ─── PO-0002 (ready-mix) — pending approval (above threshold) ─── */
  const rmSub = 320 * 600;
  const rmTax = rmSub * 0.05;
  const [po2] = await db
    .insert(s.purchaseOrders)
    .values({
      companyId: co.id,
      number: "PO-0002",
      type: "purchase_order",
      projectId: p1,
      vendorId: vendors["Gulf Ready-Mix LLC"],
      title: "Ready-mix concrete C40 — 600 m3",
      status: "pending_approval",
      subtotal: m(rmSub),
      taxAmount: m(rmTax),
      totalAmount: m(rmSub + rmTax),
      expectedDate: iso(8),
      paymentTerms: "30 days",
      createdBy: buyer,
    })
    .returning();
  await db.insert(s.purchaseOrderLines).values({
    companyId: co.id,
    poId: po2.id,
    requirementId: reqs["Ready-mix concrete C40"],
    wbsId: wbs1["2.0"],
    itemName: "Ready-mix concrete C40",
    unit: "m3",
    quantity: q(600),
    unitPrice: m(320),
    lineTotal: m(rmSub),
    sortOrder: 0,
  });
  await db
    .insert(s.approvals)
    .values({
      companyId: co.id,
      type: "purchase_order",
      entityType: "purchase_order",
      entityId: po2.id,
      title: "PO-0002 — Ready-mix concrete C40 (600 m3)",
      amount: m(rmSub + rmTax),
      projectId: p1,
      status: "pending",
      requestedBy: buyer,
    })
    .returning();

  /* ─── PO-0003 (cement) — fully received → requirement fulfilled ─── */
  const cemSub = 18 * 1200;
  const cemTax = cemSub * 0.05;
  const [po3] = await db
    .insert(s.purchaseOrders)
    .values({
      companyId: co.id,
      number: "PO-0003",
      type: "purchase_order",
      projectId: p1,
      vendorId: vendors["Gulf Ready-Mix LLC"],
      title: "Cement OPC 50kg — 1200 bags",
      status: "received",
      subtotal: m(cemSub),
      taxAmount: m(cemTax),
      totalAmount: m(cemSub + cemTax),
      expectedDate: iso(-20),
      createdBy: buyer,
      approvedBy: finance,
      approvedAt: new Date(Date.now() - 25 * DAY),
      releasedAt: new Date(Date.now() - 24 * DAY),
    })
    .returning();
  const [po3Line] = await db
    .insert(s.purchaseOrderLines)
    .values({
      companyId: co.id,
      poId: po3.id,
      requirementId: reqs["Cement OPC 50kg bags"],
      wbsId: wbs1["3.0"],
      itemName: "Cement OPC 50kg bags",
      unit: "bag",
      quantity: q(1200),
      unitPrice: m(18),
      lineTotal: m(cemSub),
      receivedQty: q(1200),
      sortOrder: 0,
    })
    .returning();
  costRows.push({ companyId: co.id, projectId: p1, wbsId: wbs1["3.0"], type: "actual", amount: m(cemSub), sourceType: "grn", description: "GRN-0002 — cement received", postedBy: storekeeper });
  const [grn2] = await db
    .insert(s.goodsReceipts)
    .values({
      companyId: co.id,
      number: "GRN-0002",
      poId: po3.id,
      vendorId: vendors["Gulf Ready-Mix LLC"],
      projectId: p1,
      warehouseId: mainStore.id,
      deliveryNoteNumber: "DN-GRM-1180",
      receivedDate: iso(-20),
      status: "posted",
      receivedBy: storekeeper,
    })
    .returning();
  await db.insert(s.goodsReceiptLines).values({
    companyId: co.id,
    grnId: grn2.id,
    poLineId: po3Line.id,
    itemName: "Cement OPC 50kg bags",
    unit: "bag",
    orderedQty: q(1200),
    receivedQty: q(1200),
    acceptedQty: q(1200),
    condition: "good",
    unitCost: m(18),
  });
  const [cementStock] = await db
    .insert(s.inventoryItems)
    .values({
      companyId: co.id,
      warehouseId: mainStore.id,
      itemName: "Cement OPC 50kg bags",
      unit: "bag",
      quantity: q(400),
      allocatedQty: q(0),
      unitCost: m(18),
      reorderPoint: q(200),
    })
    .returning();
  await db.insert(s.inventoryMovements).values([
    { companyId: co.id, itemId: cementStock.id, type: "receipt", quantity: q(1200), unitCost: m(18), referenceType: "grn", referenceId: grn2.id, projectId: p1, performedBy: storekeeper },
    { companyId: co.id, itemId: cementStock.id, type: "issue", quantity: q(-800), unitCost: m(18), referenceType: "issue", projectId: p1, taskId: taskCore, notes: "Issued to core wall works", performedBy: storekeeper },
  ]);

  /* ─── Subcontract SUB-0001 (released) ─── */
  const subSub = 480_000;
  await db.insert(s.purchaseOrders).values({
    companyId: co.id,
    number: "SUB-0001",
    type: "subcontract",
    projectId: p1,
    vendorId: vendors["Pinnacle Subcontractors"],
    title: "Shoring & excavation subcontract",
    status: "released",
    subtotal: m(subSub),
    taxAmount: m(subSub * 0.05),
    totalAmount: m(subSub * 1.05),
    expectedDate: iso(-60),
    createdBy: buyer,
    approvedBy: finance,
    approvedAt: new Date(Date.now() - 95 * DAY),
    releasedAt: new Date(Date.now() - 92 * DAY),
  });
  costRows.push({ companyId: co.id, projectId: p1, wbsId: wbs1["2.0"], type: "actual", amount: m(subSub), sourceType: "subcontract", description: "SUB-0001 Pinnacle — excavation", postedBy: finance });

  /* ─── change order (submitted → pending approval) ─── */
  const [co1] = await db
    .insert(s.changeOrders)
    .values({
      companyId: co.id,
      number: "CO-0001",
      projectId: p1,
      title: "Additional basement waterproofing membrane",
      description: "Client requested upgraded tanking system to basement walls.",
      status: "submitted",
      costImpact: m(120_000),
      revenueImpact: m(155_000),
      scheduleImpactDays: 6,
      reason: "Client variation request VR-07",
      requestedBy: pm,
    })
    .returning();
  await db.insert(s.approvals).values({
    companyId: co.id,
    type: "change_order",
    entityType: "change_order",
    entityId: co1.id,
    // Approval amount is the COST (budget) impact that actually posts; revenue
    // is carried in the title so the approver sees the margin effect. Build the
    // title exactly as submitChangeOrder() does so seeded approvals are
    // indistinguishable from live ones and always render the tenant's currency.
    title: `${co1.number} — ${co1.title} · revenue ${formatMoney(num(co1.revenueImpact), co.currencyCode)}`,
    amount: m(120_000),
    projectId: p1,
    status: "pending",
    requestedBy: pm,
  });

  /* ─── invoice (milestone, partially paid) ─── */
  const invSub = 1_800_000;
  const invTax = invSub * 0.05;
  const [inv1] = await db
    .insert(s.invoices)
    .values({
      companyId: co.id,
      number: "INV-0001",
      projectId: p1,
      type: "progress",
      title: "Progress claim #1 — substructure works",
      status: "partially_paid",
      subtotal: m(invSub),
      taxAmount: m(invTax),
      totalAmount: m(invSub + invTax),
      progressPercent: "15",
      amountPaid: m(1_000_000),
      issueDate: iso(-30),
      dueDate: iso(0),
      createdBy: finance,
    })
    .returning();
  await db.insert(s.invoiceLines).values([
    { companyId: co.id, invoiceId: inv1.id, wbsId: wbs1["1.0"], description: "Preliminaries & mobilization", amount: m(400_000), sortOrder: 0 },
    { companyId: co.id, invoiceId: inv1.id, wbsId: wbs1["2.0"], description: "Substructure works to date", amount: m(1_400_000), sortOrder: 1 },
  ]);
  await db.insert(s.payments).values({
    companyId: co.id,
    invoiceId: inv1.id,
    amount: m(1_000_000),
    paidDate: iso(-10),
    method: "Bank transfer",
    reference: "TT-99213",
    recordedBy: finance,
  });

  /* ─── a couple of tasks/requirements for PRJ-002 so it isn't empty ─── */
  const p2 = projects["PRJ-002"];
  const wbs2 = wbsByProjectCode["PRJ-002"];
  await db.insert(s.tasks).values([
    { companyId: co.id, projectId: p2, wbsId: wbs2["5.0"], name: "Partition & ceiling works", status: "in_progress", progress: "55", startDate: iso(-40), dueDate: iso(20), assigneeId: pm, sortOrder: 0 },
    { companyId: co.id, projectId: p2, wbsId: wbs2["6.0"], name: "Medical gas & HVAC", status: "in_progress", progress: "40", startDate: iso(-20), dueDate: iso(40), assigneeId: pm, sortOrder: 1 },
  ]);
  costRows.push({ companyId: co.id, projectId: p2, wbsId: wbs2["5.0"], type: "actual", amount: m(640_000), sourceType: "manual", description: "Finishes works to date", postedBy: finance });
  costRows.push({ companyId: co.id, projectId: p2, wbsId: wbs2["6.0"], type: "commitment", amount: m(380_000), sourceType: "po", description: "MEP package committed", postedBy: buyer });

  /* ─── post cost ledger + audit trail ─── */
  await db.insert(s.costPostings).values(costRows.filter((c) => Number(c.amount) !== 0));

  auditRows.push(
    { companyId: co.id, actorId: pm, actorName: "Rajesh Kumar", action: "project.create", entityType: "project", entityId: p1, summary: "Created project Marina Heights Tower", risk: "neutral", projectId: p1 },
    { companyId: co.id, actorId: pm, actorName: "Rajesh Kumar", action: "requirement.raise", entityType: "requirement", summary: "Raised requirement: Reinforcement steel Y16 (45 ton)", risk: "warning", projectId: p1 },
    { companyId: co.id, actorId: buyer, actorName: "Leila Saad", action: "rfq.award", entityType: "rfq", entityId: rfq1.id, summary: "Awarded RFQ-0001 to Emirates Steel Industries", risk: "neutral", projectId: p1 },
    { companyId: co.id, actorId: finance, actorName: "Sara Nasser", action: "po.approve", entityType: "purchase_order", entityId: po1.id, summary: "Approved & released PO-0001", risk: "warning", projectId: p1 },
    { companyId: co.id, actorId: storekeeper, actorName: "Marco Reyes", action: "grn.post", entityType: "goods_receipt", entityId: grn1.id, summary: "Posted GRN-0001 — 30 ton steel received", risk: "good", projectId: p1 },
    { companyId: co.id, actorId: storekeeper, actorName: "Marco Reyes", action: "stock.allocate", entityType: "allocation", summary: "Allocated 25 ton steel to raft foundation — block cleared", risk: "good", projectId: p1 },
    { companyId: co.id, actorId: pm, actorName: "Rajesh Kumar", action: "changeorder.submit", entityType: "change_order", entityId: co1.id, summary: "Submitted CO-0001 for approval", risk: "warning", projectId: p1 },
    { companyId: co.id, actorId: finance, actorName: "Sara Nasser", action: "invoice.create", entityType: "invoice", entityId: inv1.id, summary: "Raised progress invoice INV-0001", risk: "neutral", projectId: p1 },
  );
  await db.insert(s.auditEvents).values(auditRows);

  // number sequences so the next generated docs continue cleanly
  await db.insert(s.numberSequences).values([
    { companyId: co.id, entity: "PO", nextVal: 3 },
    { companyId: co.id, entity: "SUB", nextVal: 1 },
    { companyId: co.id, entity: "RFQ", nextVal: 1 },
    { companyId: co.id, entity: "GRN", nextVal: 2 },
    { companyId: co.id, entity: "CO", nextVal: 1 },
    { companyId: co.id, entity: "INV", nextVal: 1 },
    { companyId: co.id, entity: "PRJ", nextVal: 3 },
  ]);

  /* ───────────────── second tenant (RLS isolation proof) ───────────────── */
  console.log("→ second tenant (Skyline Builders)…");
  const [coB] = await db
    .insert(s.companies)
    .values({ name: DEMO_COMPANY_B.name, slug: DEMO_COMPANY_B.slug, currencyCode: "AED" })
    .returning();
  await db.insert(s.users).values({
    companyId: coB.id,
    email: "admin@skyline.test",
    fullName: "Omar Said",
    passwordHash: pw,
    role: "admin",
    title: "Administrator",
  });
  await db.insert(s.projects).values({
    companyId: coB.id,
    code: "PRJ-001",
    name: "Sharjah Retail Plaza",
    clientName: "Skyline Holdings",
    location: "Sharjah",
    status: "active",
    budget: m(8_000_000),
    contractValue: m(9_200_000),
    progress: "22",
  });

  await sql.end();
  console.log("\n✓ Seed complete.");
  console.log(`  Demo company: ${DEMO_COMPANY.name}`);
  console.log(`  Login with any of these (password: ${DEMO_PASSWORD}):`);
  for (const a of DEMO_ACCOUNTS) console.log(`    ${a.label.padEnd(16)} ${a.email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
