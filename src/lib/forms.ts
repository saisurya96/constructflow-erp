import { z } from "zod";

export type ActionState =
  | { ok: true; message?: string; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
  | null;

export function ok(message?: string, redirectTo?: string): ActionState {
  return { ok: true, message, redirectTo };
}

export function fail(
  error: string,
  fieldErrors?: Record<string, string>,
): ActionState {
  return { ok: false, error, fieldErrors };
}

/** Parse a FormData against a zod schema, returning flattened field errors. */
export function parseForm<T extends z.ZodTypeAny>(
  schema: T,
  formData: FormData,
):
  | { success: true; data: z.infer<T> }
  | { success: false; fieldErrors: Record<string, string> } {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value === "") continue;
    raw[key] = value;
  }
  const result = schema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    if (path && !fieldErrors[path]) fieldErrors[path] = issue.message;
  }
  return { success: false, fieldErrors };
}

/** zod coercion helpers for HTML form values. */
export const zMoney = z.coerce.number().min(0).default(0);
/** Money that may be negative — e.g. deductive/omission variations and credits. */
export const zSignedMoney = z.coerce.number().default(0);
export const zQty = z.coerce.number().positive();
export const zOptionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .optional();
export const zRequiredDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required");
