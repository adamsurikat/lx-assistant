import assert from "node:assert/strict";
import { test } from "node:test";
import { groupJiraBoardTickets } from "./jiraBoard";
import type { JiraTicket } from "./jira";

function ticket(id: number, status: string, statusCategory?: string): JiraTicket {
  return { id: String(id), key: `TEST-${id}`, summary: `Ticket ${id}`, status, statusCategory };
}

test("the board places every ticket in exactly one of four columns and preserves ticket order", () => {
  const before = [ticket(1, "Open"), ticket(2, "In Progress"), ticket(3, "Testing"), ticket(4, "Custom active status")];
  const acceptance = [ticket(5, "Ready for Acceptance"), ticket(6, " READY FOR ACCEPTANCE ", "done")];
  const release = [ticket(7, "Resolved", "done"), ticket(8, "Ready for Release"), ticket(9, " RESOLVED ")];
  const done = [ticket(10, "Done"), ticket(11, "Closed"), ticket(12, "Canceled"), ticket(13, "Cancelled"), ticket(14, "Archived", "done")];
  const input = [before[0], acceptance[0], release[0], done[0], ...before.slice(1), ...acceptance.slice(1), ...release.slice(1), ...done.slice(1)];
  const columns = groupJiraBoardTickets(input);
  assert.deepEqual(columns, { before, acceptance, release, done });
  assert.deepEqual(Object.values(columns).flat().map(({ id }) => id).sort(), input.map(({ id }) => id).sort());
});

test("an empty board retains all four columns", () => {
  assert.deepEqual(groupJiraBoardTickets([]), { before: [], acceptance: [], release: [], done: [] });
});
