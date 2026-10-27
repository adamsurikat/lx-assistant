"use client";

import { useEffect, useState, type FormEvent } from "react";

interface AccountUser {
  id: string;
  name: string | null;
  email: string | null;
  isAdmin: boolean;
  passwordSet: boolean;
}

export function AdminUsersPanel() {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [invitation, setInvitation] = useState<{ email: string; url: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/users", { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load users.");
      setUsers(data.users);
    }).catch((error) => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load users.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: values.get("name"), email: values.get("email") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add user.");
      setUsers((current) => [...current, data.user]);
      setInvitation({ email: data.user.email, url: new URL(data.setupPath, window.location.origin).href });
      form.reset();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not add user.");
    } finally { setBusy(false); }
  }

  async function copyInvitation() {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.url);
      setCopied(true);
    } catch {
      setError("Select the setup link and copy it manually.");
    }
  }

  return (
    <section aria-labelledby="users-heading" className="space-y-3">
      <h1 id="users-heading" className="nb-display text-2xl">User accounts</h1>
      <div className="nb-panel space-y-5 p-6">
        <p className="text-sm text-nb-ink/70">Only you can add users. Each new user chooses their password using a private setup link.</p>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-semibold">Name
            <input name="name" autoComplete="off" required maxLength={100} className="nb-input mt-1 w-full px-3 py-2" />
          </label>
          <label className="block text-sm font-semibold">Email
            <input name="email" type="email" autoComplete="off" required maxLength={254} className="nb-input mt-1 w-full px-3 py-2" />
          </label>
          <button disabled={busy || loading} className="nb-btn nb-btn-orange px-4 py-2 text-sm">{busy ? "Adding…" : "Add user"}</button>
        </form>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {invitation && (
          <div className="space-y-3 rounded-xl bg-nb-green/10 p-4">
            <p role="status" className="break-words text-sm font-semibold">Account created for {invitation.email}.</p>
            <p className="text-sm text-nb-ink/70">Share this link privately with the user. It works once and expires in one hour.</p>
            <label className="block text-sm font-semibold">Password setup link
              <input readOnly value={invitation.url} onFocus={(event) => event.currentTarget.select()} className="nb-input mt-1 w-full px-3 py-2 text-xs" />
            </label>
            <button type="button" onClick={copyInvitation} className="nb-btn px-4 py-2 text-sm">{copied ? "Copied" : "Copy link"}</button>
          </div>
        )}
        {loading ? <p className="text-sm">Loading users…</p> : (
          <ul aria-label="User accounts" className="divide-y divide-nb-ink/10">
            {users.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{user.name || user.email}</p>
                  <p className="break-words text-nb-ink/60">{user.email}</p>
                </div>
                <span className="nb-badge">{user.isAdmin ? "Admin" : user.passwordSet ? "Active" : "Awaiting password"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
