"use client";

import { Suspense } from "react";
import LoginForm from "@/components/login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="lean-shell"><p className="muted">טוען…</p></main>}>
      <LoginForm />
    </Suspense>
  );
}
