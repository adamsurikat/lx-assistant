import type { JiraTicket } from "./jira";

export type JiraBoardColumn = "before" | "acceptance" | "release" | "done";

export function groupJiraBoardTickets(tickets: JiraTicket[]): Record<JiraBoardColumn, JiraTicket[]> {
  const columns: Record<JiraBoardColumn, JiraTicket[]> = { before: [], acceptance: [], release: [], done: [] };
  for (const ticket of tickets) {
    const status = ticket.status.trim().toLowerCase();
    if (status === "ready for acceptance") columns.acceptance.push(ticket);
    else if (status === "resolved" || status === "ready for release") columns.release.push(ticket);
    else if (["done", "closed", "canceled", "cancelled"].includes(status) || ticket.statusCategory === "done") columns.done.push(ticket);
    else columns.before.push(ticket);
  }
  return columns;
}
