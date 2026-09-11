import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { refreshAccessToken } from "@/lib/atlassian-oauth";

export class JiraNotConfiguredError extends Error {
  constructor() {
    super("Jira is not connected for this user. Connect Jira in Settings.");
    this.name = "JiraNotConfiguredError";
  }
}

export type JiraUserConfig =
  | { mode: "oauth"; accessToken: string; cloudId: string; siteUrl: string }
  | { mode: "token"; jiraEmail: string; apiToken: string; siteUrl: string };

// Refresh a bit before actual expiry to avoid racing a request against token
// expiration.
const EXPIRY_BUFFER_MS = 60_000;

/**
 * Loads the current user's Jira connection from the DB. Supports two
 * connection methods (a user has at most one, but OAuth takes priority if
 * somehow both are present):
 *  - "oauth": Atlassian OAuth 2.0 (3LO), optional, set up via Settings.
 *    Transparently refreshes (and persists) the access token if expired.
 *  - "token": a manually-entered Jira API token (the default/simple method).
 */
export async function getJiraConfigForUser(userId: string): Promise<JiraUserConfig> {
  const connection = await prisma.jiraConnection.findUnique({
    where: { userId },
  });

  if (connection) {
    if (connection.expiresAt.getTime() - EXPIRY_BUFFER_MS > Date.now()) {
      return {
        mode: "oauth",
        accessToken: decryptSecret(connection.accessTokenCipher),
        cloudId: connection.cloudId,
        siteUrl: connection.siteUrl,
      };
    }

    // Access token is expired (or nearly so) — refresh it and persist the
    // new tokens. Atlassian may rotate the refresh token, so always store
    // what it returns.
    const refreshToken = decryptSecret(connection.refreshTokenCipher);
    const tokens = await refreshAccessToken(refreshToken);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await prisma.jiraConnection.update({
      where: { userId },
      data: {
        accessTokenCipher: encryptSecret(tokens.access_token),
        refreshTokenCipher: encryptSecret(tokens.refresh_token),
        expiresAt,
      },
    });

    return {
      mode: "oauth",
      accessToken: tokens.access_token,
      cloudId: connection.cloudId,
      siteUrl: connection.siteUrl,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { jiraEmail: true, jiraApiTokenCipher: true, jiraSiteUrl: true },
  });

  if (!user?.jiraEmail || !user.jiraApiTokenCipher || !user.jiraSiteUrl) {
    throw new JiraNotConfiguredError();
  }

  return {
    mode: "token",
    jiraEmail: user.jiraEmail,
    apiToken: decryptSecret(user.jiraApiTokenCipher),
    siteUrl: user.jiraSiteUrl,
  };
}

function authHeader(config: JiraUserConfig): string {
  if (config.mode === "oauth") {
    return `Bearer ${config.accessToken}`;
  }
  const basic = Buffer.from(`${config.jiraEmail}:${config.apiToken}`).toString(
    "base64"
  );
  return `Basic ${basic}`;
}

function baseUrl(config: JiraUserConfig): string {
  return config.mode === "oauth"
    ? `https://api.atlassian.com/ex/jira/${config.cloudId}`
    : config.siteUrl.replace(/\/$/, "");
}

async function jiraFetch(
  config: JiraUserConfig,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = `${baseUrl(config)}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(config),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  return res;
}

export interface JiraTicket {
  id: string;
  key: string;
  summary: string;
  status: string;
}

// The JQL used by the "Sync" button in the tickets drawer when the user
// hasn't set a custom one (see User.ticketSyncJql). Only tickets assigned
// to the current user, not yet Done, and in a currently active sprint —
// backlog issues and issues on boards without sprints are excluded, so only
// what's actually being worked on right now shows up.
export const DEFAULT_TICKET_SYNC_JQL =
  "assignee = currentUser() AND sprint in openSprints() ORDER BY updated DESC";

/**
 * Fetches issues matching the given JQL (defaulting to
 * DEFAULT_TICKET_SYNC_JQL), for the "Sync" button in the tickets drawer.
 */
export async function fetchAssignedOpenTickets(
  config: JiraUserConfig,
  jql: string = DEFAULT_TICKET_SYNC_JQL
): Promise<JiraTicket[]> {
  const res = await jiraFetch(
    config,
    `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,status&maxResults=100`
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira search failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    issues: Array<{
      id: string;
      key: string;
      fields: { summary: string; status: { name: string } };
    }>;
  };

  return data.issues.map((issue) => ({
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
  }));
}

/**
 * Fetches a single Jira issue by its key or id (e.g. "PROJ-123"), regardless
 * of assignee/status, for the "add any ticket manually" free-text lookup.
 * Returns null if the issue doesn't exist or isn't accessible.
 */
export async function fetchTicketByKey(
  config: JiraUserConfig,
  keyOrId: string
): Promise<JiraTicket | null> {
  const res = await jiraFetch(
    config,
    `/rest/api/3/issue/${encodeURIComponent(keyOrId)}?fields=summary,status`
  );

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira issue lookup failed (${res.status}): ${body}`);
  }

  const issue = (await res.json()) as {
    id: string;
    key: string;
    fields: { summary: string; status: { name: string } };
  };

  return {
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
  };
}

export interface WorklogInput {
  issueIdOrKey: string;
  startedISO: string; // ISO 8601 timestamp
  timeSpentSeconds: number;
  comment?: string;
}

/**
 * Builds the Atlassian Document Format payload Jira expects for a worklog
 * comment. Returns undefined for a blank/absent comment so it can be spread
 * into a request body without adding an empty `comment` field.
 */
function toJiraCommentDoc(comment?: string) {
  if (!comment) return undefined;
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: comment }],
      },
    ],
  };
}

/**
 * Creates a new worklog entry on a Jira issue.
 */
export async function createWorklog(
  config: JiraUserConfig,
  input: WorklogInput
): Promise<{ id: string }> {
  const commentDoc = toJiraCommentDoc(input.comment);
  const res = await jiraFetch(
    config,
    `/rest/api/3/issue/${encodeURIComponent(input.issueIdOrKey)}/worklog`,
    {
      method: "POST",
      body: JSON.stringify({
        started: toJiraDateTime(input.startedISO),
        timeSpentSeconds: Math.max(60, input.timeSpentSeconds),
        ...(commentDoc ? { comment: commentDoc } : {}),
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira createWorklog failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

/**
 * Updates an existing worklog entry on a Jira issue (e.g. after a
 * drag/resize, or after the user edits its comment).
 */
export async function updateWorklog(
  config: JiraUserConfig,
  issueIdOrKey: string,
  worklogId: string,
  input: Omit<WorklogInput, "issueIdOrKey">
): Promise<void> {
  const res = await jiraFetch(
    config,
    `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/worklog/${worklogId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        started: toJiraDateTime(input.startedISO),
        timeSpentSeconds: Math.max(60, input.timeSpentSeconds),
        // Always send the comment field (even null) so clearing a comment
        // locally also clears it on the Jira worklog.
        comment: toJiraCommentDoc(input.comment) ?? null,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira updateWorklog failed (${res.status}): ${body}`);
  }
}

export async function deleteWorklog(
  config: JiraUserConfig,
  issueIdOrKey: string,
  worklogId: string
): Promise<void> {
  const res = await jiraFetch(
    config,
    `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/worklog/${worklogId}`,
    { method: "DELETE" }
  );

  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Jira deleteWorklog failed (${res.status}): ${body}`);
  }
}

// Jira expects "yyyy-MM-dd'T'HH:mm:ss.SSSZZZZZ" e.g. 2024-01-01T09:00:00.000+0000
function toJiraDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const tzOffsetMin = -d.getTimezoneOffset();
  const sign = tzOffsetMin >= 0 ? "+" : "-";
  const tz = `${sign}${pad(Math.floor(Math.abs(tzOffsetMin) / 60))}${pad(
    Math.abs(tzOffsetMin) % 60
  )}`;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.` +
    `${pad(d.getMilliseconds(), 3)}${tz}`
  );
}
