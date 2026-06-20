# ConstructFlow — A Week in the Life of a Real Firm
### A role-play walkthrough (to share)

**What this is.** Instead of clicking every feature to see if it "works," we picked a believable small construction firm, gave it real people and real jobs, and *lived a normal business week inside the product* — Monday to Friday. The rule we held ourselves to: **act like a real company that owes the software nothing.** If a step was annoying, slow, or fake, we said so. The question underneath everything: **would this firm actually pay for this, instead of going back to spreadsheets and group texts?**

Everyone you'll meet logs in with **their own account and their own role** — so we could see whether work genuinely *hands off* from one person to the next (a PM's request showing up on the buyer's screen without an email), which is the whole promise of the product.

---

## The company we're pretending to be

**Foundry Build Co.** — a small commercial **fit-out / tenant-improvement** contractor in Austin, TX. About 8 people. They build out cafés, clinics, and offices for landlords and business owners. Today they run on spreadsheets, text messages, paper POs, and a shared email inbox. Currency: **USD**.

### The cast (one login each)

| Person | Role in the app | Real-world job |
|---|---|---|
| **Dale Whitfield** | Administrator | Owner / principal. Approves money, watches the bottom line. |
| **Priya Nair** | Project Manager | Plans the jobs, raises material needs, owns client changes. |
| **Marcus Bell** | Procurement | Sources materials, gets quotes, cuts POs and subcontracts. |
| **Tony Alvarez** | Stores | Site superintendent. Receives deliveries, manages stock, issues to the job. |
| **Susan Park** | Cost & Finance | Bookkeeper. Approvals, billing, payments, job costing. |

### Their three live jobs (entered as their real pipeline)

| Job | Type | Contract | Status at go-live |
|---|---|---|---|
| **Eastside Coffee Roasters — Café Build-Out** | Interior fit-out | $420,000 | Active, ~40% done |
| **Lamar Dental — Clinic Fit-out** | Interior fit-out | $680,000 | Active, early |
| **Mueller Office TI — Suite 200** | Renovation | $295,000 | Just won, mobilizing |

Most of the week happens on the **café** job, because that's the one with work due *this week* — exactly how a real firm's attention works.

---

# MONDAY

### 1. Dale opens the box (≈ first 15 minutes)
- Dale lands on the sign-in page. The pitch speaks straight to him: *"The first ERP a small construction team actually wants to use — built for firms running on spreadsheets, WhatsApp and paper."*
- He clicks **Create a company**, enters *Foundry Build Co.*, his name, email, a password, and picks **United States** — the app instantly switches the currency to **USD** on its own. He's in, looking at his own dashboard, in under a minute.
- He opens **Administration → Company settings** and lowers the **PO approval threshold** from $50,000 to **$10,000** — "I want to personally sign off on anything over ten grand." He adds the company address.

### 2. Dale gets his crew their logins
- In **Administration → Invite / add user**, Dale creates four accounts, each with a name, role, and a starting password:
  - Priya Nair → **Project Manager**
  - Marcus Bell → **Procurement**
  - Tony Alvarez → **Stores**
  - Susan Park → **Cost & Finance**
- The team page now shows all five, with an adoption tracker ("Have signed in: 0 of 5"). Dale's whole company is set up before coffee.

### 3. Dale enters the three live jobs
- In **Projects → New project**, Dale adds each job: name, client, location, contract value, and a **cost-code template** (he picks "Interior fit-out" for the café and clinic, "Renovation" for the office). The app auto-builds a phase-based budget skeleton (WBS) for each.
- He sets the café and clinic to **Active**, leaves the office in **Planning**.
- The **Projects portfolio** now shows all three with contract value, status, and health. Dale hands the rest of the planning to Priya and signs off.

### 4. Priya (PM) logs in — and the hand-off just works
- Priya signs in with *her* account. Her workspace is trimmed to exactly her job: **Dashboard, My Work, Projects, Requirements, Approvals** — none of the procurement/finance/admin clutter. The two active jobs Dale created are already there. Nothing was re-typed.

### 5. Priya plans the café
- **Budget:** On the café's **Budget / WBS** tab she cost-loads the phases (Partitions & Ceilings $55k, Flooring $60k, Joinery/Millwork $70k, MEP $85k, Preliminaries $25k). The project header instantly recomputes: **Budget $295k → Forecast margin $125k (30% of contract).** Set the costs, see the profit — immediately.
- **Schedule:** On the **Schedule** tab she breaks the job into tasks on a Monday-style board (Demolition, Metal-stud framing, **Drywall/insulation/ceilings**, MEP rough-in, Roaster counter & millwork), assigns them to Tony and herself, links each to a cost code and dates. She marks the first two **Done** and two **In progress** — the project header rolls up to **40% complete**, matching reality.
- **The key move — raising material needs:** On the drywall task she clicks **Raise requirement** and enters *5/8" Type-X drywall, 120 sheets, needed Friday*. She raises a second on the MEP task: *HVAC rooftop unit, 5-ton, ~$14,000*. The instant she does, the project shows a red banner — **"2 tasks blocked by material shortage"** — and each requirement starts tracking coverage (Allocated / Received / Inbound / **Shortage**).
- **Billing milestone:** She adds a *"Framing & rough-in complete — $84,000"* milestone so the job can be billed when it's earned.

### 6. Priya's command center
- Her **Dashboard** has turned her morning's work into a prioritized, owned, dated to-do list — the **Action queue**:
  - *Blocked: Drywall — due in 2 days — Owner: Tony — Impact: schedule slip → Resolve*
  - *Blocked: MEP rough-in — Owner: Priya → Resolve*
  - *Requirement: drywall / HVAC unit — Material at risk → Review*
- **My Work** shows the tasks assigned to her across every project. *This* is the thing a spreadsheet can never do: tell you what to do next.

---

# TUESDAY

### 7. Marcus (Procurement) picks up the baton — untouched by human hands
- Marcus logs in to his own scoped workspace (*"Procurement — Source, compare & order"*). Sitting in his **Procurement queue**, already, are the two needs Priya raised yesterday: *"Source: drywall — due in 2d"* and *"Source: HVAC rooftop unit."* **Nobody emailed him. Nothing was re-keyed.** This is the single behavior that justifies the whole product.
- His **Sourcing inbox** lists both with quantity, estimated value, coverage, and need-by date, each with **Start sourcing** and **RFQ** buttons.

### 8. Marcus builds the supplier list
- Foundry is brand new, so there are no vendors yet. Marcus adds his suppliers in **Vendors**: *Lone Star Drywall Supply*, *Capitol HVAC Distributors*, *Austin Mechanical Supply*, and his electrical subcontractor *Brightline Electric*.

### 9. Marcus sources the $14k HVAC unit (the competitive buy)
- From the HVAC requirement he clicks **RFQ** — and the request form opens **already filled in** with the item, quantity, unit, and project. He invites two HVAC suppliers, sets a quote deadline, and **Issues** the RFQ (he can also print a PDF to email out).
- Quotes come back; he keys them in. The **comparison view** lays them side by side and flags the best of each: lowest price, shortest lead time, highest compliance:
  - *Capitol HVAC: $12,400 — but delivers **Jul 6***
  - *Austin Mechanical: $13,100 — delivers **Jun 25**, 96% compliant*
- The unit is **needed by Jun 30**. Capitol is $700 cheaper but would land *late*. Marcus **awards Austin Mechanical** — schedule beats $700. The tool made that trade-off obvious instead of hiding it behind "lowest bid." Awarding auto-creates **PO-0001 ($13,100)**.
- He submits PO-0001. Because it's over Dale's $10k threshold, it doesn't go out — it flips to **"Awaiting approval"** and lands in the owner's queue. Exactly the control Dale wanted.

### 10. Marcus cuts the drywall PO (the everyday buy)
- The drywall is a routine commodity buy from a known supplier, so he turns it into **PO-0002 ($2,160)** to Lone Star. It's under the threshold, so submitting **releases it immediately** — and the cost is now *committed* to the café's budget.
- Back on his sourcing inbox, the drywall line flips to **"Ordered"** with a full coverage bar; the "shortage" count ticks down. The HVAC stays "short" until its approval clears. The buyer can see, at a glance, what's covered and what isn't.

> **One rough edge worth flagging (the buyer's daily annoyance):** there's no one-click "raise a PO from this requirement" for everyday buys. To keep the coverage tracking correct, even a $2,160 commodity order has to go through the full RFQ ritual. A "quick PO from requirement" button would save the buyer real time on the 80% of orders that aren't competitive bids.

---

# WEDNESDAY

### 11. Dale approves the big buy
- Dale opens **Approvals**, sees *PO-0001 — HVAC unit — $13,100 — requested by Marcus*, and approves it. The system tells him plainly what that means ("approving a PO releases it and commits cost"). One click: the order is released, the cost is committed to the café's MEP budget, and an audit line records *"Approved by Dale Whitfield, 14:21."*

### 12. Tony receives the delivery — including the short shipment
- The drywall truck shows up. Tony opens **Deliveries**, sees both released orders waiting, and hits **Receive** on the drywall PO.
- Reality bites: the order was **120 sheets but only 100 arrived** (20 backordered). Tony enters delivery note *DN-LSD-3392* and records **100 received**. He posts **GRN-0001**.
- Instantly: **100 sheets land in inventory** (Main Store), the **actual cost is recognized** against the café, and the PO shows partially received with 20 still outstanding. (The receipt screen even separates *accepted* vs *rejected* quantities, for when sheets arrive damaged.)

### 13. Tony stages the material to the task
- In **Allocations**, the app has already paired the open drywall requirement with the 100 sheets now in stock. Tony clicks **Reserve**, assigns it to the *Drywall* task, and the **shortage flag clears** — even though 20 are still on backorder, because the system nets *100 reserved + 20 still on order = the 120 needed.* The task that was blocked all week is now good to go.

> The whole chain — **Priya's request → Marcus's order → Dale's approval → Tony's receipt → stock → cost → task unblocked** — happened without a single spreadsheet, phone call, or "did anyone order the drywall?" text. That chain *is* the product.

### 14. The client asks for a change; Priya logs it
- Eastside's owner wants a **glass garage door** added to the storefront for indoor/outdoor seating. Priya opens the café's **Change Orders** tab and logs **CO-0001**: cost impact **+$18,000**, what they'll bill the client **+$24,000**, schedule **+5 days**. She submits it — and because it moves money, it routes to Dale for approval (it'll add to both the contract value and the budget when he signs off). No more variations done on a handshake and forgotten at invoice time.

### 15. Priya does her site walk
- Back on the café board, she opens the **Drywall** task. It's no longer blocked. She adds a **punch-list item** ("hang & tape wet walls first") and leaves a **comment**: *"Site walk 6/16: framing inspection passed. 100 sheets on site, 20 backordered — start hanging the wet walls."* It's stamped with her name and time, and Tony will see it on the same task. The site conversation now lives on the work, not in a group chat nobody can search later.

---

# THURSDAY

### 16. Marcus subcontracts the electrician
- The café needs an electrician. Marcus raises **SUB-0001**, a $22,000 lump-sum subcontract to Brightline Electric, tied to the MEP cost code. Over the threshold, so it too routes to Dale for sign-off.

### 17. Susan bills the client and banks a payment
- Susan (the bookkeeper) raises **Progress Claim #1** on the café: **$84,000** for work completed to date, against the right cost code. She sends it, and the invoice becomes a clean, client-ready PDF (Foundry's name and address up top, balance due at the bottom).
- The client pays **$50,000** on account. Susan records it (bank transfer, reference, date). The invoice flips to **Partially Paid**, **$34,000 outstanding** — and that's now visible to anyone who needs it.

---

# FRIDAY — the owner's review (the moment of truth)

### 18. Dale clears his approvals
- Dale opens **Approvals**: the change order ($18k) and the subcontract ($22k) are both waiting, with who asked and how old. He approves both. The change order instantly **lifts the café's contract value to $444,000 and its budget to $313,000**; the subcontract **commits another $22,000** of cost.

### 19. Dale checks whether he's making money
- On **Job Costing**, the whole portfolio is one table — budget vs committed vs actual vs forecast vs **margin per job**. The café reads: **Budget $313k · Committed $35k · Actual $2k · Forecast margin $131,000 (30%)**. He didn't open a spreadsheet. He didn't call anyone. Every number was assembled by his team simply doing their jobs this week.
- Opening the café itself, he sees the single picture: **Contract $444,000 · Forecast margin $131,000 · Billed $84,000 · $360k left to bill · 40% complete · 1 task still waiting on a part.**

### 20. Dale checks adoption
- In **Administration**, the team page shows **"Signed in: 100% (5 of 5)"** — everyone actually used it this week. And the **Audit Trail** has all 63 actions of the week, by person, exportable — the receipts for every dollar and decision.

---

## So — would Foundry pay for this?

**Yes — with one bug fixed first.**

What won the week: the thing the product promises actually happened. Priya raised a need on a task on Monday and it appeared on Marcus's screen Tuesday, became a real order, got Dale's sign-off, was received (short!) by Tony, unblocked the task, posted its cost, and rolled up into a live margin Dale could read on Friday — **all without one spreadsheet, one re-typed number, or one "did we order that?" text.** Five people, five logins, one connected flow. That is worth paying for to a firm drowning in WhatsApp and Excel. The job-costing, the RFQ comparison, the approval threshold, the partial-delivery handling, the task-level punch list and comments, the client-ready invoice, and the audit trail are all genuinely good.

What has to be fixed before they'd trust it with their money: the **Finance dashboard (and a few other spots) show amounts in "AED" for this US/USD company.** On the bookkeeper's screen, seeing the wrong currency is the kind of thing that makes a small firm quietly cancel. It's a small code fix, but it's load-bearing for trust.

The honest caveats (not deal-breakers, but they'd grumble): there's no quick "make a PO from this need" for everyday buys (everything routes through the full RFQ); and a firm switching mid-job can't easily tell the system "this job is already 40% done" without back-filling history.

**Verdict: this is a product a real small contractor would adopt and pay for — once the currency bug is gone and the everyday-PO shortcut exists.**

---

## Want to see it yourself?
The whole week is sitting in a live workspace you can log into (USD demo company **Foundry Build Co.**). Same password for everyone: `Foundry#2026`.

| Login | Role | What they did this week |
|---|---|---|
| dale@foundrybuild.com | Owner / Admin | Set up the company, approved the money, reviewed the margins |
| priya@foundrybuild.com | Project Manager | Planned the café, raised the material needs, logged the change order |
| marcus@foundrybuild.com | Procurement | Ran the RFQ, cut the POs and the subcontract |
| tony@foundrybuild.com | Stores / Super | Received the (short) delivery, staged the material |
| susan@foundrybuild.com | Cost & Finance | Billed the client, banked the payment |

*Start as Dale to see the whole picture, or as Priya → Marcus → Tony to watch one material need travel across the team.*

---

*Document maintained live during the role-play. Companion file: a candid findings/issues log is kept separately for the build team.*
