"use client";

import { useEffect, useState, type FormEvent } from "react";
import { signOut } from "next-auth/react";

export function PasswordPanel() {
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/account/password").then(async (response) => {
      if (!response.ok) throw new Error("Could not load account settings.");
      setPasswordSet((await response.json()).passwordSet);
    }).catch(() => setError("Could not load account settings. Refresh to try again."));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirmPassword")) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.get("currentPassword"), password: form.get("password") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save password.");
      await signOut({ callbackUrl: "/login" });
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save password."); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="nb-panel space-y-4 p-6">
    <p className="text-sm text-nb-ink/70">Sign in with your email and password. After saving, sign in again with your new password.</p>
    {passwordSet === null && !error && <p className="text-sm">Loading…</p>}
    {passwordSet && <label className="block text-sm font-semibold">Current password<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} className="nb-input mt-1 w-full px-3 py-2" /></label>}
    {passwordSet !== null && <>
      <label className="block text-sm font-semibold">New password<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="nb-input mt-1 w-full px-3 py-2" /></label>
      <p className="text-xs text-nb-ink/60">Use at least 12 characters.</p>
      <label className="block text-sm font-semibold">Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="nb-input mt-1 w-full px-3 py-2" /></label>
      <button disabled={busy} className="nb-btn nb-btn-orange px-4 py-2 text-sm">{busy ? "Saving…" : passwordSet ? "Change password" : "Set password"}</button>
    </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>;
}
