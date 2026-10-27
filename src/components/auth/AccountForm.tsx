"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import styles from "./AccountForm.module.css";

type Mode = "login" | "setup";

export function AccountForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [complete, setComplete] = useState(false);
  const title = mode === "login" ? "Sign in" : "Set your password";

  useEffect(() => {
    if (mode === "setup") {
      const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (value) {
        // The private fragment exists only in the browser, after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setToken(value);
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, [mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (mode !== "login" && password !== form.get("confirmPassword")) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const email = String(form.get("email") ?? "");
      if (mode === "setup") {
        const response = await fetch("/api/auth/password", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not save your account.");
        setComplete(true);
        return;
      }
      const result = await signIn("credentials", { email, password, redirect: false, callbackUrl: "/" });
      if (result?.error) throw new Error(result.code === "rate_limited" ? "Too many attempts. Try again in 15 minutes." : "Email or password is incorrect.");
      router.replace("/");
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not sign in. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <main className={`${styles.page} flex min-h-screen items-center justify-center p-6`}>
      <div className={`${styles.panel} nb-panel w-full max-w-sm p-8`}>
        <h1 className="nb-display text-center text-3xl">lx-assistant</h1>
        <h2 className="mb-6 mt-2 text-center text-lg font-semibold">{title}</h2>
        {complete ? (
          <div className="space-y-4 text-center"><p role="status">Password saved. Sign in with your email and password.</p><Link href="/login" className="nb-btn nb-btn-orange px-4 py-2">Sign in</Link></div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {mode !== "setup" && <label className="block text-sm font-semibold">Email<input name="email" type="email" autoComplete="username" required maxLength={254} className="nb-input mt-1 w-full px-3 py-2" /></label>}
            <label className="block text-sm font-semibold">Password<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? undefined : 12} maxLength={128} className="nb-input mt-1 w-full px-3 py-2" /></label>
            {mode !== "login" && <><p className="text-xs text-nb-ink/60">Use at least 12 characters.</p><label className="block text-sm font-semibold">Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="nb-input mt-1 w-full px-3 py-2" /></label></>}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            {mode === "setup" && !token && <p role="alert" className="text-sm text-red-700">Open the password setup link provided by your server administrator.</p>}
            <button disabled={busy || (mode === "setup" && !token)} className="nb-btn nb-btn-orange w-full px-4 py-3">{busy ? "Please wait…" : title}</button>
          </form>
        )}
        {mode === "login" && <details className="mt-5 text-left text-sm text-nb-ink/70"><summary className="cursor-pointer">Forgot password?</summary><p className="mt-2">Ask the server administrator for a password setup link to keep your existing account and data.</p></details>}
      </div>
    </main>
  );
}
