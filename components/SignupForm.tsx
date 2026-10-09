"use client";

import { useActionState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { create } from "@/app/form-actions";

const initialState = { message: "" };

export function SignupForm({ submitLabel = "Notify me" }: { submitLabel?: string }) {
  const [state, formAction, isPending] = useActionState(create, initialState);

  return (
    <form className="grid gap-2" action={formAction}>
      <label htmlFor="name" className="text-sm font-medium">Name</label>
      <Input id="name" name="name" autoComplete="name" required />
      <label htmlFor="email" className="mt-2 text-sm font-medium">Email</label>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Submitting…" : submitLabel}
      </Button>
      <p
        aria-live="polite"
        className="min-h-5 text-sm text-center text-muted-foreground"
      >
        {state?.message}
      </p>
    </form>
  );
}
