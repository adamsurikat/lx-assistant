import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { refreshAccessToken } from "@/lib/atlassian-oauth";
import { groupStagingTickets, groupProductionDeploymentTickets, type StagingUpdateResult } from "./jiraStaging";
import {
  RECENTLY_VIEWED_TICKET_LIMIT,
  RECENTLY_VIEWED_TICKETS_JQL,
} from "@/lib/jiraJqlPresets";

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
  statusCategory?: string;
}

async function fetchJiraPages<T>(
  config: JiraUserConfig,
  path: string,
  signal?: AbortSignal
): Promise<T[]> {
  const values: T[] = [];
  let startAt = 0;
  while (true) {
    const res = await jiraFetch(config, `${path}?startAt=${startAt}&maxResults=100`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) {
      throw new Error(`Jira version lookup failed (${res.status}): ${await res.text()}`);
    }
    const page = (await res.json()) as {
      values: T[];
      startAt: number;
      total?: number;
      isLast?: boolean;
    };
    values.push(...page.values);
    const nextStartAt = page.startAt + page.values.length;
    if (page.isLast || (page.total !== undefined && nextStartAt >= page.total)) return values;
    if (nextStartAt <= startAt) throw new Error("Jira version pagination did not advance");
    startAt = nextStartAt;
  }
}

export async function fetchJiraFixVersions(
  config: JiraUserConfig,
  signal?: AbortSignal
): Promise<string[]> {
  const projects = await fetchJiraPages<{ id: string }>(config, "/rest/api/3/project/search", signal);
  const names = new Set<string>();
  // Bound parallel requests when a Jira account can access many projects.
  for (let index = 0; index < projects.length; index += 5) {
    const results = await Promise.all(projects.slice(index, index + 5).map((project) =>
      fetchJiraPages<{ name: string }>(
        config,
        `/rest/api/3/project/${encodeURIComponent(project.id)}/version`,
        signal
      )
    ));
    for (const versions of results) {
      for (const version of versions) {
        if (/^\d{4}\.\d{1,2}\.\d{1,2}-\d+$/.test(version.name)) names.add(version.name);
      }
    }
  }
  // Selecting a shared version name keeps the ticket search across projects.
  return [...names].sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
}

export async function fetchStagingDeploymentTickets(
  config: JiraUserConfig,
  fixVersion: string,
  signal?: AbortSignal
): Promise<JiraTicket[]> {
  const version = fixVersion.trim();
  if (!version) throw new Error("An expected fix version is required");

  // Quote user input as a JQL string, including embedded quotes/backslashes.
  const jql = `assignee = currentUser() AND fixVersion = ${JSON.stringify(version)} ORDER BY key ASC`;
  return fetchAllJiraTickets(config, jql, signal);
}

const FIX_VERSION_EXCLUDED_STATUSES = new Set([
  "to do", "on hold", "requirements pending", "waiting for support", "waiting for customer",
]);

function isFixVersionStatusExcluded(status: string): boolean {
  return FIX_VERSION_EXCLUDED_STATUSES.has(status.trim().toLowerCase());
}

export async function fetchUnversionedTickets(config: JiraUserConfig, signal?: AbortSignal): Promise<JiraTicket[]> {
  const tickets = await fetchAllJiraTickets(config,
    "assignee = currentUser() AND statusCategory != Done AND fixVersion IS EMPTY ORDER BY key ASC", signal);
  return tickets.filter((ticket) => !isFixVersionStatusExcluded(ticket.status));
}

async function fetchAllJiraTickets(config: JiraUserConfig, jql: string, signal?: AbortSignal): Promise<JiraTicket[]> {
  const tickets: JiraTicket[] = [];
  const seenTokens = new Set<string>();
  let nextPageToken: string | undefined;

  do {
    const res = await jiraFetch(config, "/rest/api/3/search/jql", {
      method: "POST",
      cache: "no-store",
      signal,
      body: JSON.stringify({
        jql,
        fields: ["summary", "status"],
        maxResults: 100,
        nextPageToken,
      }),
    });
    if (!res.ok) {
      throw new Error(`Jira search failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as {
      issues: Array<{
        id: string;
        key: string;
        fields: { summary: string; status: { name: string; statusCategory?: { key: string } } };
      }>;
      isLast: boolean;
      nextPageToken?: string;
    };
    for (const issue of data.issues) {
      tickets.push({
        id: issue.id,
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        statusCategory: issue.fields.status.statusCategory?.key,
      });
    }

    if (data.isLast) break;
    nextPageToken = data.nextPageToken;
    if (!nextPageToken || seenTokens.has(nextPageToken)) {
      throw new Error("Jira did not provide a new page token for the remaining tickets");
    }
    seenTokens.add(nextPageToken);
  } while (nextPageToken);

  return tickets;
}

export interface JiraFixVersionUpdateResult {
  updated: JiraTicket[];
  failed: Array<{ id: string; key?: string; error: string }>;
}

export async function setMissingFixVersions(
  config: JiraUserConfig,
  fixVersion: string,
  ticketIds: string[]
): Promise<JiraFixVersionUpdateResult> {
  const version = fixVersion.trim();
  if (!/^\d{4}\.\d{1,2}\.\d{1,2}-\d+$/.test(version) || !ticketIds.length || ticketIds.some((id) => !/^\d+$/.test(id))) {
    throw new Error("A valid fix version and ticket IDs are required");
  }
  const me = await jiraFetch(config, "/rest/api/3/myself", { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!me.ok) throw new Error("Could not verify the Jira user");
  const { accountId } = await me.json() as { accountId: string };
  if (!accountId) throw new Error("Could not verify the Jira user");

  // Version names are shared across projects, but their IDs are project-specific.
  type ProjectVersion = { id: string; name: string; archived?: boolean };
  const projectVersions = new Map<string, Promise<ProjectVersion[]>>();
  const result: JiraFixVersionUpdateResult = { updated: [], failed: [] };
  const ids = [...new Set(ticketIds)];
  for (let index = 0; index < ids.length; index += 5) {
    const outcomes = await Promise.all(ids.slice(index, index + 5).map(async (id) => {
      let key: string | undefined;
      try {
        const path = `/rest/api/3/issue/${encodeURIComponent(id)}`;
        const response = await jiraFetch(config, `${path}?fields=summary,status,assignee,fixVersions,project`, {
          cache: "no-store", signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`Could not read this ticket from Jira (${response.status}).`);
        const issue = await response.json() as {
          id: string; key: string;
          fields: {
            summary: string;
            status: { name: string; statusCategory: { key: string } };
            assignee: { accountId: string } | null;
            fixVersions: Array<{ name: string }>;
            project: { id: string; key: string };
          };
        };
        key = issue.key;
        if (issue.fields.assignee?.accountId !== accountId || issue.fields.status.statusCategory.key === "done") {
          throw new Error("This ticket is no longer open and assigned to you. Refresh the list.");
        }
        if (isFixVersionStatusExcluded(issue.fields.status.name)) {
          throw new Error("This ticket's status is excluded from Fix version. Refresh the list.");
        }
        const ticket: JiraTicket = {
          id: issue.id, key: issue.key, summary: issue.fields.summary,
          status: issue.fields.status.name, statusCategory: issue.fields.status.statusCategory.key,
        };
        // Treat a retry of a confirmed update as successful, without another write.
        if (issue.fields.fixVersions.some((item) => item.name === version)) return { ticket };
        if (issue.fields.fixVersions.length) throw new Error("This ticket already has a fix version. Refresh the list.");

        const project = issue.fields.project;
        let versions = projectVersions.get(project.id);
        if (!versions) {
          versions = fetchJiraPages<ProjectVersion>(config, `/rest/api/3/project/${encodeURIComponent(project.id)}/version`, AbortSignal.timeout(30_000));
          projectVersions.set(project.id, versions);
        }
        let availableVersions: ProjectVersion[];
        try { availableVersions = await versions; }
        catch { throw new Error(`Could not load fix versions for ${project.key}. Try again.`); }
        const target = availableVersions.find((item) => item.name === version && !item.archived);
        if (!target) throw new Error(`${version} is not available in ${project.key}.`);

        const update = await jiraFetch(config, path, {
          method: "PUT", signal: AbortSignal.timeout(30_000),
          // Add rather than replace, preserving any version added concurrently.
          body: JSON.stringify({ update: { fixVersions: [{ add: { id: target.id } }] } }),
        });
        if (!update.ok) throw new Error(`Jira rejected the fix version (${update.status}). Check permissions and editable fields in Jira.`);
        return { ticket };
      } catch (error) {
        return { failure: { id, key, error: error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError")
          ? "Could not confirm the update. Refresh the list before retrying."
          : error instanceof Error ? error.message : "Could not update this ticket." } };
      }
    }));
    for (const outcome of outcomes) {
      if (outcome.ticket) result.updated.push(outcome.ticket);
      else if (outcome.failure) result.failed.push(outcome.failure);
    }
  }
  return result;
}

export async function moveStagingTicketsToAcceptance(
  config: JiraUserConfig,
  fixVersion: string,
  ticketIds: string[]
): Promise<StagingUpdateResult> {
  return moveDeploymentTickets(config, fixVersion, ticketIds, "staging");
}

export async function moveProductionTicketsToDone(
  config: JiraUserConfig,
  fixVersion: string,
  ticketIds: string[]
): Promise<StagingUpdateResult> {
  return moveDeploymentTickets(config, fixVersion, ticketIds, "production");
}

async function moveDeploymentTickets(
  config: JiraUserConfig,
  fixVersion: string,
  ticketIds: string[],
  deployment: "staging" | "production"
): Promise<StagingUpdateResult> {
  const version = fixVersion.trim();
  if (!version || !ticketIds.length || ticketIds.some((id) => !/^\d+$/.test(id))) {
    throw new Error("A fix version and ticket IDs are required");
  }
  const me = await jiraFetch(config, "/rest/api/3/myself", {
    cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  if (!me.ok) throw new Error("Could not verify the Jira user");
  const { accountId } = await me.json() as { accountId: string };
  if (!accountId) throw new Error("Could not verify the Jira user");

  const result: StagingUpdateResult = { updated: [], failed: [] };
  const ids = [...new Set(ticketIds)];
  // Keep requests bounded, and retain successes if another ticket fails.
  for (let index = 0; index < ids.length; index += 5) {
    const outcomes = await Promise.all(ids.slice(index, index + 5).map(async (id) => {
      let key: string | undefined;
      try {
        const signal = AbortSignal.timeout(30_000);
        const path = `/rest/api/3/issue/${encodeURIComponent(id)}`;
        // Read each issue directly: Jira search results may lag recent changes.
        const response = await jiraFetch(config, `${path}?fields=summary,status,assignee,fixVersions`, { cache: "no-store", signal });
        if (!response.ok) throw new Error(`Could not read this ticket from Jira (${response.status}).`);
        const issue = await response.json() as {
          id: string; key: string;
          fields: {
            summary: string;
            status: { name: string; statusCategory?: { key: string } };
            assignee: { accountId: string } | null;
            fixVersions: Array<{ name: string }>;
          };
        };
        key = issue.key;
        if (issue.fields.assignee?.accountId !== accountId || !issue.fields.fixVersions.some((v) => v.name === version)) {
          throw new Error("This ticket is no longer assigned to you with the selected fix version. Refresh the list.");
        }
        const ticket: JiraTicket = {
          id: issue.id, key: issue.key, summary: issue.fields.summary,
          status: issue.fields.status.name, statusCategory: issue.fields.status.statusCategory?.key,
        };
        const targetStatus = deployment === "production"
          ? (ticket.key.split("-")[0].toUpperCase() === "SURHD" ? "Closed" : "Done")
          : "Ready for Acceptance";
        const columns = deployment === "production" ? groupProductionDeploymentTickets([ticket]) : groupStagingTickets([ticket]);
        // A retry after an interrupted response must not transition it again.
        if (ticket.status.trim().toLowerCase() === targetStatus.toLowerCase()) return { ticket };
        if (!columns.before.length) throw new Error(deployment === "production"
          ? "This ticket is no longer Ready for Release or Resolved. Refresh the list."
          : "This ticket is no longer before acceptance. Refresh the list.");

        const transitionsResponse = await jiraFetch(config, `${path}/transitions`, { cache: "no-store", signal });
        if (!transitionsResponse.ok) throw new Error(`Could not read available transitions (${transitionsResponse.status}).`);
        const { transitions } = await transitionsResponse.json() as {
          transitions: Array<{ id: string; to: { name: string; statusCategory?: { key: string } } }>;
        };
        const transition = transitions.find((item) => item.to.name.trim().toLowerCase() === targetStatus.toLowerCase());
        if (!transition) throw new Error(`No transition to ${targetStatus} is available from this status.`);

        const update = await jiraFetch(config, `${path}/transitions`, {
          method: "POST", signal, body: JSON.stringify({ transition: { id: transition.id } }),
        });
        if (!update.ok) {
          throw new Error(`Jira rejected the transition (${update.status}). Check permissions and required fields in Jira.`);
        }
        return { ticket: { ...ticket, status: transition.to.name, statusCategory: transition.to.statusCategory?.key } };
      } catch (error) {
        return { failure: { id, key, error: error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError")
          ? "Could not confirm the update. Refresh the list before retrying."
          : error instanceof Error ? error.message : "Could not update this ticket." } };
      }
    }));
    for (const outcome of outcomes) {
      if (outcome.ticket) result.updated.push(outcome.ticket);
      else if (outcome.failure) result.failed.push(outcome.failure);
    }
  }
  return result;
}

// The JQL used by the "Sync" button in the tickets drawer when the user
// hasn't set a custom one (see User.ticketSyncJql). Only tickets assigned
// to the current user, not yet Done, and in a currently active sprint —
// backlog issues and issues on boards without sprints are excluded, so only
// what's actually being worked on right now shows up.
export const DEFAULT_TICKET_SYNC_JQL =
  "assignee = currentUser() AND statusCategory != Done AND sprint in openSprints() ORDER BY updated DESC";

/**
 * Fetches issues matching the given JQL (defaulting to
 * DEFAULT_TICKET_SYNC_JQL), for the "Sync" button in the tickets drawer.
 */
export async function fetchAssignedOpenTickets(
  config: JiraUserConfig,
  jql: string = DEFAULT_TICKET_SYNC_JQL
): Promise<JiraTicket[]> {
  const maxResults =
    jql.trim() === RECENTLY_VIEWED_TICKETS_JQL
      ? RECENTLY_VIEWED_TICKET_LIMIT
      : 100;
  const res = await jiraFetch(
    config,
    `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,status&maxResults=${maxResults}`
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
