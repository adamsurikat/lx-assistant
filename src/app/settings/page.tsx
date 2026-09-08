"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { AppHeader } from "@/components/AppHeader";

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
    <div className="flex h-screen flex-col">
      <AppHeader active="settings" />
      <main className="mx-auto w-full max-w-lg overflow-y-auto p-8">
        <h1 className="nb-display mb-1 text-2xl">Connect Jira</h1>
        <p className="mb-6 text-sm font-medium text-nb-ink/70">
          Create an API token at{" "}
          <a
            href="https://id.atlassian.com/manage-profile/security/api-tokens"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-nb-pink decoration-2"
          >
            id.atlassian.com
          </a>{" "}
          and paste it below. It is encrypted before being stored.
        </p>

        <form onSubmit={handleSave} className="nb-panel space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-semibold tracking-wide text-nb-ink">
              Jira site URL
            </label>
            <input
              type="url"
              required
              placeholder="https://yourcompany.atlassian.net"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              className="nb-input w-full px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold tracking-wide text-nb-ink">
              Atlassian account email
            </label>
            <input
              type="email"
              required
              value={jiraEmail}
              onChange={(e) => setJiraEmail(e.target.value)}
              className="nb-input w-full px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center justify-between text-sm font-semibold tracking-wide text-nb-ink">
              <span>
                API token{" "}
                {connected && (
                  <span className="font-normal normal-case text-nb-ink/50">
                    (leave blank to keep current)
                  </span>
                )}
              </span>
              <a
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-normal normal-case text-nb-pink underline"
              >
                Get an API token
              </a>
            </label>
            <input
              type="password"
              required={!connected}
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              className="nb-input w-full px-3 py-2 text-sm"
            />
          </div>

          {message && <p className="text-sm font-bold text-nb-ink">{message}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="nb-btn nb-btn-orange px-4 py-2 text-sm font-semibold"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {connected && (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={saving}
                className="nb-btn px-4 py-2 text-sm font-semibold text-nb-pink"
              >
                Disconnect
              </button>
            )}
            {connected && (
              <span className="text-sm font-semibold text-nb-green">✓ Connected</span>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
