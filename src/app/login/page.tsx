"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white/95 p-8 text-center shadow-2xl">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          Jira Time Calendar
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          Plan your work week and log time to Jira, visually.
        </p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-3 font-medium text-white transition hover:bg-gray-700"
        >
          Sign in with Google
        </button>
      </div>
    </main>
  );
}
