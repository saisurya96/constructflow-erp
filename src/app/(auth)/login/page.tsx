"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/field";
import { SubmitButton } from "@/components/app/submit-button";
import { loginAction } from "../actions";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo";

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  // Quick-fill demo logins are a dev/demo convenience — never show them (or the
  // shared password) on a real production deployment. Opt back in for a hosted
  // demo with NEXT_PUBLIC_DEMO_LOGINS=true.
  const showDemoAccounts =
    process.env.NEXT_PUBLIC_DEMO_LOGINS === "true" ||
    process.env.NODE_ENV !== "production";

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <span className="eyebrow block text-muted-foreground">Sign in</span>
        <h1 className="font-display text-[1.7rem] font-semibold tracking-tight">
          Welcome back
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in to your ConstructFlow workspace.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <Field label="Email" htmlFor="email" required error={errors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
          />
        </Field>
        <Field label="Password" htmlFor="password" required error={errors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {state && !state.ok && state.error && (
          <p className="rounded-md bg-critical/10 px-3 py-2 text-sm text-critical">
            {state.error}
          </p>
        )}
        <SubmitButton className="w-full">Sign in</SubmitButton>
      </form>

      {showDemoAccounts && (
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="eyebrow mb-2 text-muted-foreground">
            Demo accounts · {DEMO_PASSWORD}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                }}
                className="rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create a company
        </Link>
      </p>
    </div>
  );
}
