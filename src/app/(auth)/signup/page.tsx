"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/field";
import { SubmitButton } from "@/components/app/submit-button";
import { signupAction } from "../actions";

export default function SignupPage() {
  const [state, formAction] = useActionState(signupAction, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

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
