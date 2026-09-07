import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

export class JiraNotConfiguredError extends Error {
  constructor() {
    super("Jira is not connected for this user. Add your Jira details in Settings.");
    this.name = "JiraNotConfiguredError";
  }
}

export interface JiraUserConfig {
  jiraEmail: string;
  apiToken: string;
  siteUrl: string;
}

/**
 * Loads and decrypts the current user's Jira connection details from the DB.
 */
export async function getJiraConfigForUser(userId: string): Promise<JiraUserConfig> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { jiraEmail: true, jiraApiTokenCipher: true, jiraSiteUrl: true },
  });

  if (!user?.jiraEmail || !user.jiraApiTokenCipher || !user.jiraSiteUrl) {
    throw new JiraNotConfiguredError();
  }

  return {
    jiraEmail: user.jiraEmail,
    apiToken: decryptSecret(user.jiraApiTokenCipher),
    siteUrl: user.jiraSiteUrl,
  };
}

function authHeader(config: JiraUserConfig): string {
  const basic = Buffer.from(`${config.jiraEmail}:${config.apiToken}`).toString(
    "base64"
  );
  return `Basic ${basic}`;
}

async function jiraFetch(
  config: JiraUserConfig,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = `${config.siteUrl.replace(/\/$/, "")}${path}`;
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

/**
 * Fetches issues assigned to the current user (via JQL `assignee = currentUser()`)
 * that are not in a Done/Cancelled/closed-style status category.
 */
export async function fetchAssignedOpenTickets(
  config: JiraUserConfig
): Promise<JiraTicket[]> {
  const jql =
    "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";
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

export interface WorklogInput {
  issueIdOrKey: string;
  startedISO: string; // ISO 8601 timestamp
  timeSpentSeconds: number;
  comment?: string;
}

/**
 * Creates a new worklog entry on a Jira issue.
 */
export async function createWorklog(
  config: JiraUserConfig,
  input: WorklogInput
): Promise<{ id: string }> {
  const res = await jiraFetch(
    config,
    `/rest/api/3/issue/${encodeURIComponent(input.issueIdOrKey)}/worklog`,
    {
      method: "POST",
      body: JSON.stringify({
        started: toJiraDateTime(input.startedISO),
        timeSpentSeconds: Math.max(60, input.timeSpentSeconds),
        ...(input.comment
          ? {
              comment: {
                type: "doc",
                version: 1,
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: input.comment }],
                  },
                ],
              },
            }
          : {}),
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
 * Updates an existing worklog entry on a Jira issue (e.g. after a drag/resize).
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
