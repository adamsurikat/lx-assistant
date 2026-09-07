"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-nb-green p-6">
      <div className="nb-panel w-full max-w-sm p-8 text-center">
        <h1 className="nb-display mb-2 text-3xl">Jira Time Calendar</h1>
        <p className="mb-6 text-sm font-medium text-nb-ink/70">
          Plan your work week and log time to Jira, visually.
        </p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="nb-btn nb-btn-orange w-full px-4 py-3 font-semibold"
        >
          Sign in with Google
        </button>
      </div>
    </main>
  );
}
