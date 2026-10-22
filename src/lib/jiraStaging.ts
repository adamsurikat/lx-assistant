import type { JiraTicket } from "./jira";

export type StagingColumn = "before" | "ready" | "after";

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

export function groupStagingTickets(tickets: JiraTicket[]): Record<StagingColumn, JiraTicket[]> {
  const columns: Record<StagingColumn, JiraTicket[]> = { before: [], ready: [], after: [] };
  for (const ticket of tickets) {
    const status = ticket.status.trim().toLowerCase();
    if (status === "ready for acceptance") columns.ready.push(ticket);
    else if (AFTER_ACCEPTANCE_STATUSES.has(status) || ticket.statusCategory === "done") columns.after.push(ticket);
    else columns.before.push(ticket);
  }
  return columns;
}
