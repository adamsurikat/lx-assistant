"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { AppHeader } from "@/components/AppHeader";
import { Toast } from "@/components/Toast";

const DEFAULT_JIRA_SITE_URL = "https://surikat.atlassian.net";
const GOOGLE_CALENDAR_SCOPE =
  "openid email profile https://www.googleapis.com/auth/calendar.readonly";

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "You need to be signed in to connect Jira.",
  invalid_state: "The connection attempt expired or was invalid. Please try again.",
  no_sites: "No accessible Jira sites were found for your Atlassian account.",
  connection_failed: "Failed to connect to Jira. Please try again.",
  access_denied: "Jira connection was cancelled.",
  oauth_not_configured: "OAuth connection isn't configured on this server.",
};

interface JiraStatus {
  connected: boolean;
  method: "oauth" | "token" | null;
  jiraSiteUrl: string | null;
  jiraEmail: string | null;
  oauthAvailable: boolean;
}

function JiraConnectionPanel() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [status, setStatus] = useState<JiraStatus | null>(null);
  // Which method the UI is currently showing (independent of what's
  // actually connected) — a simple toggle between the two optional methods.
  const [useOAuth, setUseOAuth] = useState(false);

  const [jiraEmail, setJiraEmail] = useState("");
  const [siteUrl, setSiteUrl] = useState(DEFAULT_JIRA_SITE_URL);
  const [apiToken, setApiToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(() => {
    const jiraError = searchParams.get("jira_error");
    if (jiraError) {
      return ERROR_MESSAGES[jiraError] ?? "Failed to connect to Jira.";
    }
    if (searchParams.get("jira_connected")) {
      return "Jira connected.";
    }
    return null;
  });
  const dismissMessage = useCallback(() => setMessage(null), []);

  const loadStatus = () => {
    fetch("/api/jira/token")
      .then((res) => res.json())
      .then((data: JiraStatus) => {
        setStatus(data);
        setUseOAuth(data.method === "oauth");
        setJiraEmail(data.jiraEmail ?? session?.user?.email ?? "");
        setSiteUrl(data.jiraSiteUrl ?? DEFAULT_JIRA_SITE_URL);
      });
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/jira/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jiraEmail, siteUrl, apiToken }),
    });
    if (res.ok) {
      setApiToken("");
      setMessage("Jira connection saved.");
      loadStatus();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Failed to save Jira connection.");
    }
    setSaving(false);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await fetch("/api/jira/token", { method: "DELETE" });
    setApiToken("");
    setMessage("Jira disconnected.");
    loadStatus();
    setDisconnecting(false);
  };

  const connected = status?.connected ?? false;
  const connectedViaOAuth = status?.method === "oauth";
  const connectedViaToken = status?.method === "token";

  return (
    <div className="space-y-4">
      {status?.oauthAvailable && (
        <label className="flex items-center gap-2 text-sm font-semibold text-nb-ink">
          <input
            type="checkbox"
            checked={useOAuth}
            onChange={(e) => setUseOAuth(e.target.checked)}
          />
          Use Atlassian OAuth instead of an API token
        </label>
      )}

      {useOAuth ? (
        <div className="nb-panel space-y-4 p-6">
          <p className="text-sm font-medium text-nb-ink/70">
            Sign in with your Atlassian account to let this app read your
            assigned tickets and sync worklogs on your behalf. You can revoke
            access at any time from your{" "}
            <a
              href="https://id.atlassian.com/manage-profile/security"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-nb-pink decoration-2"
            >
              Atlassian account settings
            </a>
            .
          </p>

          {connectedViaOAuth ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-nb-green">
                ✓ Connected{status?.jiraSiteUrl ? ` to ${status.jiraSiteUrl}` : ""}
              </span>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="nb-btn px-4 py-2 text-sm font-semibold text-nb-pink"
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          ) : (
            <a
              href="/api/jira/connect"
              className="nb-btn nb-btn-orange inline-block px-4 py-2 text-sm font-semibold"
            >
              Connect Jira
            </a>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-nb-ink/70">
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

          <form onSubmit={handleSaveToken} className="nb-panel space-y-4 p-6">
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
                  {connectedViaToken && (
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
                required={!connectedViaToken}
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="nb-input w-full px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="nb-btn nb-btn-orange px-4 py-2 text-sm font-semibold"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              {connectedViaToken && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="nb-btn px-4 py-2 text-sm font-semibold text-nb-pink"
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </button>
              )}
              {connectedViaToken && (
                <span className="text-sm font-semibold text-nb-green">✓ Connected</span>
              )}
            </div>
          </form>
        </>
      )}

      {!useOAuth && connectedViaOAuth && (
        <p className="text-sm font-medium text-nb-ink/70">
          Currently connected via OAuth. Saving an API token above will
          disconnect the OAuth connection.
        </p>
      )}

      <Toast message={message} onDismiss={dismissMessage} />
      {connected === false && status === null && (
        <p className="text-sm">Checking connection…</p>
      )}
    </div>
  );
}

function GoogleCalendarPanel() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);

  const loadStatus = () => {
    fetch("/api/google-calendar/status")
      .then((res) => res.json())
      .then((data: { connected: boolean }) => setConnected(data.connected))
      .catch(() => setConnected(false));
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    // Re-runs the Google OAuth flow requesting the extra calendar scope
    // (in addition to the base login scope); the account is the same
    // provider/providerAccountId, so this just upgrades the stored
    // access/refresh token + scope (see the jwt callback in auth.ts) —
    // the user isn't signed out or re-linked to a new account.
    await signIn(
      "google",
      { callbackUrl: "/settings" },
      { access_type: "offline", prompt: "consent", scope: GOOGLE_CALENDAR_SCOPE }
    );
  };

  return (
    <div className="nb-panel space-y-4 p-6">
      <p className="text-sm font-medium text-nb-ink/70">
        Optional — grant read-only access to your Google Calendar to see
        your meetings alongside logged time. Not required to use the app.
      </p>
      {connected === null && <p className="text-sm">Checking connection…</p>}
      {connected === true && (
        <span className="text-sm font-semibold text-nb-green">✓ Connected</span>
      )}
      {connected === false && (
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="nb-btn nb-btn-orange px-4 py-2 text-sm font-semibold"
        >
          {connecting ? "Connecting…" : "Connect Google Calendar"}
        </button>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="flex h-screen flex-col">
      <AppHeader active="settings" />
      <main className="mx-auto w-full max-w-lg overflow-y-auto p-8 space-y-8">
        <div>
          <h1 className="nb-display mb-1 text-2xl">Connect Jira</h1>

          <Suspense fallback={<p className="text-sm">Loading…</p>}>
            <JiraConnectionPanel />
          </Suspense>
        </div>

        <div>
          <h1 className="nb-display mb-1 text-2xl">Connect Google Calendar</h1>
          <GoogleCalendarPanel />
        </div>
      </main>
    </div>
  );
}
