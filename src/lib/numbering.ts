import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";

/**
 * Allocate the next per-company document number, e.g. PO-0001, RFQ-0002.
 * Atomic via INSERT ... ON CONFLICT inside the caller's tenant transaction.
 */
export async function nextNumber(
  tx: Tx,
  companyId: string,
  entity: string,
  prefix: string,
  pad = 4,
): Promise<string> {
  const rows = (await tx.execute(sql`
    insert into number_sequences (company_id, entity, next_val)
    values (${companyId}, ${entity}, 1)
    on conflict (company_id, entity)
    do update set next_val = number_sequences.next_val + 1
    returning next_val
  `)) as unknown as Array<{ next_val: number }>;
  const seq = Number(rows[0].next_val);
  return `${prefix}-${String(seq).padStart(pad, "0")}`;
}
