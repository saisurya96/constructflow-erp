import type { UserRole } from "@/db/schema";

/** Shared between the seed script and the login page's quick-fill buttons. */
export const DEMO_PASSWORD = "password123";

export const DEMO_COMPANY = {
  name: "Buildwell Contracting",
  slug: "buildwell",
};

/** A second tenant exists purely to demonstrate RLS isolation. */
export const DEMO_COMPANY_B = {
  name: "Skyline Builders",
  slug: "skyline",
};

export const DEMO_ACCOUNTS: {
  role: UserRole;
  email: string;
  fullName: string;
  label: string;
}[] = [
  { role: "admin", email: "admin@buildwell.test", fullName: "Amina Hassan", label: "Administrator" },
  { role: "pm", email: "pm@buildwell.test", fullName: "Rajesh Kumar", label: "Project Manager" },
  { role: "buyer", email: "buyer@buildwell.test", fullName: "Leila Saad", label: "Procurement" },
  { role: "storekeeper", email: "stores@buildwell.test", fullName: "Marco Reyes", label: "Stores" },
  { role: "finance", email: "finance@buildwell.test", fullName: "Sara Nasser", label: "Cost & Finance" },
];
