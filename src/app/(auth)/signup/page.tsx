"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/app/field";
import { SubmitButton } from "@/components/app/submit-button";
import { COUNTRIES, CURRENCY_OPTIONS, localeForCountry } from "@/lib/constants";
import { signupAction } from "../actions";

export default function SignupPage() {
  const [state, formAction] = useActionState(signupAction, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  // Country drives the suggested currency + VAT, but the currency stays
  // overridable. Nothing is assumed — and it's all editable later in settings.
  const DEFAULT_COUNTRY = "US";
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [currency, setCurrency] = useState(localeForCountry(DEFAULT_COUNTRY).currency);
  const onCountry = (code: string) => {
    setCountry(code);
    setCurrency(localeForCountry(code).currency);
  };
  const locale = localeForCountry(country);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your company</h1>
        <p className="text-sm text-muted-foreground">
          Set up your workspace. You become the administrator and can invite your team.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <Field label="Company name" htmlFor="companyName" required error={errors.companyName}>
          <Input id="companyName" name="companyName" placeholder="Acme Contracting" required />
        </Field>
        <Field label="Your name" htmlFor="fullName" required error={errors.fullName}>
          <Input id="fullName" name="fullName" placeholder="Jane Doe" required />
        </Field>
        <Field label="Email" htmlFor="email" required error={errors.email}>
          <Input id="email" name="email" type="email" placeholder="you@company.com" required />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          required
          error={errors.password}
          hint="At least 8 characters"
        >
          <Input id="password" name="password" type="password" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country" htmlFor="country" required error={errors.country}>
            <NativeSelect
              id="country"
              name="country"
              value={country}
              onChange={(e) => onCountry(e.currentTarget.value)}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Currency"
            htmlFor="currencyCode"
            required
            error={errors.currencyCode}
            hint={
              locale.vat > 0
                ? `VAT/GST set to ${locale.vat}% for ${locale.name} — editable later`
                : `No VAT/GST for ${locale.name} — editable later`
            }
          >
            <NativeSelect
              id="currencyCode"
              name="currencyCode"
              value={currency}
              onChange={(e) => setCurrency(e.currentTarget.value)}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {state && !state.ok && state.error && (
          <p className="rounded-md bg-critical/10 px-3 py-2 text-sm text-critical">
            {state.error}
          </p>
        )}
        <SubmitButton className="w-full">Create company</SubmitButton>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
