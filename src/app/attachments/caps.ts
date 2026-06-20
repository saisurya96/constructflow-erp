import type { Capability } from "@/lib/rbac";

/** Capability required to DOWNLOAD an attachment, by the entity it belongs to. */
export const ATTACHMENT_READ_CAP: Record<string, Capability> = {
  purchase_order: "procurement.view",
  subcontract: "procurement.view",
  invoice: "billing.manage",
  project: "projects.view",
  change_order: "projects.view",
  requirement: "projects.view",
};

/**
 * Capability required to UPLOAD/attach to an entity. Manage-level (stricter than
 * read) so a view-only role can't plant files on records it otherwise can't
 * write — symmetric write gating to match the download route.
 */
export const ATTACHMENT_WRITE_CAP: Record<string, Capability> = {
  purchase_order: "procurement.manage",
  subcontract: "procurement.manage",
  invoice: "billing.manage",
  project: "projects.manage",
  change_order: "changeorders.manage",
  requirement: "requirements.raise",
};
