"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface CalendarStatus { connected: boolean; available: boolean; email: string | null }

export function GoogleCalendarPanel() {
  const params = useSearchParams();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [error, setError] = useState(params.get("google_error") ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/google-calendar/status").then(async (response) => {
      if (!response.ok) throw new Error();
      setStatus(await response.json());
    }).catch(() => setError("Could not load the Calendar connection. Refresh to try again."));
  }, []);

  async function connect() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/google-calendar/connect", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not connect Google Calendar.");
      window.location.assign(data.url);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not connect Google Calendar."); setBusy(false); }
  }

  async function disconnect() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/google-calendar/connect", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not disconnect Google Calendar.");
      setStatus((previous) => previous && { ...previous, connected: false, email: null });
    } catch (error) { setError(error instanceof Error ? error.message : "Could not disconnect Google Calendar."); }
    finally { setBusy(false); }
  }

  return <div className="nb-panel space-y-4 p-6">
    <p className="text-sm font-medium text-nb-ink/70">Optional — connect a Google account to see its calendar alongside your logged time. Your app account stays separate.</p>
    {!status && !error && <p className="text-sm">Checking connection…</p>}
    {status?.connected && <p role="status" className="text-sm font-semibold">Connected{status.email ? ` as ${status.email}` : ""}</p>}
    {status && !status.available && <p className="text-sm text-nb-ink/70">Google Calendar is not configured on this server.</p>}
    {status?.available && <button type="button" onClick={connect} disabled={busy} className="nb-btn nb-btn-orange px-4 py-2 text-sm">{busy ? "Please wait…" : status.connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}</button>}
    {status?.connected && <button type="button" onClick={disconnect} disabled={busy} className="nb-btn ml-2 px-4 py-2 text-sm">Disconnect</button>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
