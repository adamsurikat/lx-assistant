import type { JiraTicket } from "./jira";

export type StagingColumn = "before" | "ready" | "after";

export interface StagingUpdateResult {
  updated: JiraTicket[];
  failed: Array<{ id: string; key?: string; error: string }>;
}

// Jira's status categories do not distinguish acceptance from release.
// Use the deployment workflow's later statuses as well as completed statuses.
const AFTER_ACCEPTANCE_STATUSES = new Set([
  "resolved",
  "ready for release",
  "closed",
  "done",
  "canceled",
  "cancelled",
]);

function groupTickets(tickets: JiraTicket[], correctStatuses: string[], beforeStatuses?: string[]): Record<StagingColumn, JiraTicket[]> {
  const columns: Record<StagingColumn, JiraTicket[]> = { before: [], ready: [], after: [] };
  for (const ticket of tickets) {
    const status = ticket.status.trim().toLowerCase();
    if (correctStatuses.includes(status)) columns.ready.push(ticket);
    else if (beforeStatuses?.includes(status)) columns.before.push(ticket);
    else if (AFTER_ACCEPTANCE_STATUSES.has(status) || ticket.statusCategory === "done") columns.after.push(ticket);
    else if (!beforeStatuses) columns.before.push(ticket);
  }
  return columns;
}

export function groupStagingTickets(tickets: JiraTicket[]): Record<StagingColumn, JiraTicket[]> {
  return groupTickets(tickets, ["ready for acceptance"]);
}

export function groupUserAcceptanceTickets(tickets: JiraTicket[]): Record<StagingColumn, JiraTicket[]> {
  return groupTickets(tickets, ["resolved", "ready for release"], ["ready for acceptance"]);
}
