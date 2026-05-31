"use client";

import { useActionState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { create } from "@/app/form-actions";

const initialState = { message: "" };

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(create, initialState);

  return (
    <form className="grid gap-2" action={formAction}>
      <Input id="name" name="name" placeholder="Name" required />
      <Input
        id="email"
        name="email"
        type="email"
        placeholder="Email"
        required
      />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Signing up…" : "Sign Up"}
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
