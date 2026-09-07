"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

const DEFAULT_JIRA_SITE_URL = "https://surikat.atlassian.net";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [jiraEmail, setJiraEmail] = useState("");
  const [siteUrl, setSiteUrl] = useState(DEFAULT_JIRA_SITE_URL);
  const [apiToken, setApiToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/jira/token")
      .then((res) => res.json())
      .then((data) => {
        setConnected(Boolean(data.connected));
        // Prefill with saved values if present, otherwise default the site URL
        // and use the signed-in Google account's email as the Jira email.
        setJiraEmail(data.jiraEmail ?? session?.user?.email ?? "");
        setSiteUrl(data.jiraSiteUrl ?? DEFAULT_JIRA_SITE_URL);
      });
  }, [session?.user?.email]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/jira/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jiraEmail, siteUrl, apiToken }),
    });
    if (res.ok) {
      setConnected(true);
      setApiToken("");
      setMessage("Jira connection saved.");
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Failed to save Jira connection.");
    }
    setSaving(false);
  };

  const handleDisconnect = async () => {
    setSaving(true);
    await fetch("/api/jira/token", { method: "DELETE" });
    setConnected(false);
    setApiToken("");
    setSaving(false);
  };

  return (
    <main className="mx-auto max-w-lg p-8">
      <Link href="/" className="mb-4 inline-block text-sm text-indigo-600 underline">
        ← Back to calendar
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Connect Jira</h1>
      <p className="mb-6 text-sm text-gray-500">
        Create an API token at{" "}
        <a
          href="https://id.atlassian.com/manage-profile/security/api-tokens"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          id.atlassian.com
        </a>{" "}
        and paste it below. It is encrypted before being stored.
      </p>

      <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-gray-200 p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Jira site URL
          </label>
          <input
            type="url"
            required
            placeholder="https://yourcompany.atlassian.net"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Atlassian account email
          </label>
          <input
            type="email"
            required
            value={jiraEmail}
            onChange={(e) => setJiraEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            API token {connected && <span className="text-gray-400">(leave blank to keep current)</span>}
          </label>
          <input
            type="password"
            required={!connected}
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {message && <p className="text-sm text-gray-600">{message}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {connected && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={saving}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Disconnect
            </button>
          )}
          {connected && (
            <span className="text-sm font-medium text-green-600">✓ Connected</span>
          )}
        </div>
      </form>
    </main>
  );
}
