import assert from "node:assert/strict";
import { test } from "node:test";
import { groupStagingTickets } from "./jiraStaging";
import type { JiraTicket } from "./jira";

function ticket(status: string, statusCategory?: string): JiraTicket {
  return { id: status, key: status, summary: status, status, statusCategory };
}

test("every ticket appears once in the appropriate staging column, preserving its order", () => {
  const before = ["Open", "In Progress", "Reopened", "Code review", "Ready for QA", "Testing"].map((status) => ticket(status));
  const ready = [ticket("Ready for Acceptance"), ticket(" READY FOR ACCEPTANCE ", "done")];
  const after = ["Resolved", "Ready for Release", "Closed", "Done", "Canceled", "Cancelled", "DONE"].map((status) => ticket(status));
  after.push(ticket("Custom completed status", "done"));
  const input = [...after, ...ready, ...before];
  assert.deepEqual(groupStagingTickets(input), { before, ready, after });
  assert.equal(input.length, before.length + ready.length + after.length);
});

test("empty searches retain all three columns", () => {
  assert.deepEqual(groupStagingTickets([]), { before: [], ready: [], after: [] });
});
