import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchUnversionedTickets, setMissingFixVersions, type JiraUserConfig } from "./jira";

const config: JiraUserConfig = { mode: "oauth", accessToken: "test-token", cloudId: "test-cloud", siteUrl: "https://jira.example.test" };
const version = "2026.10.21-0";

function issue(id: string, project = "100") {
  return { id, key: `TEST-${id}`, fields: {
    summary: `Ticket ${id}`, status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
    assignee: { accountId: "current-user" } as { accountId: string } | null,
    fixVersions: [] as Array<{ name: string }>, project: { id: project, key: `PROJECT-${project}` },
  } };
}

test("missing-version search loads every page of the current user's open, unversioned tickets", async (t) => {
  const bodies: Array<{ jql: string; nextPageToken?: string }> = [];
  const signal = new AbortController().signal;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.atlassian.com/ex/jira/test-cloud/rest/api/3/search/jql");
    assert.equal(init.method, "POST");
    assert.equal(init.signal, signal);
    assert.equal(init.cache, "no-store");
    bodies.push(JSON.parse(init.body as string));
    return Response.json(bodies.length === 1
      ? { issues: Array.from({ length: 100 }, (_, i) => issue(String(i + 1))), isLast: false, nextPageToken: "second" }
      : { issues: [issue("101")], isLast: true });
  });
  const tickets = await fetchUnversionedTickets(config, signal);
  assert.equal(tickets.length, 101);
  assert.equal(tickets.at(-1)?.key, "TEST-101");
  assert.deepEqual(bodies.map((body) => body.jql), Array(2).fill("assignee = currentUser() AND statusCategory != Done AND fixVersion IS EMPTY ORDER BY key ASC"));
  assert.equal(bodies[1].nextPageToken, "second");
});

test("a later missing-version search failure never returns an incomplete list", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => ++calls === 1
    ? Response.json({ issues: [issue("1")], isLast: false, nextPageToken: "second" })
    : new Response(null, { status: 429 }));
  await assert.rejects(fetchUnversionedTickets(config), /Jira search failed \(429\)/);
});

test("the Fix version list excludes pending and waiting statuses across pages, ignoring case and whitespace", async (t) => {
  const excluded = ["To Do", "On Hold", "Requirements Pending", "Waiting for Support", "Waiting for Customer", " TO DO "];
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    const issues = (++calls === 1 ? excluded.slice(0, 3) : excluded.slice(3)).map((status, index) => {
      const data = issue(`${calls}${index}`); data.fields.status.name = status; return data;
    });
    issues.push(issue(String(calls)));
    return Response.json({ issues, isLast: calls === 2, nextPageToken: "second" });
  });
  assert.deepEqual((await fetchUnversionedTickets(config)).map(({ id }) => id), ["1", "2"]);
});

test("bulk updates skip tickets moved into any excluded Fix version status", async (t) => {
  const statuses = ["To Do", "On Hold", "Requirements Pending", "Waiting for Support", "Waiting for Customer", " WAITING FOR CUSTOMER "];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    assert.notEqual(init.method, "PUT");
    assert.ok(!input.includes("/project/"));
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const id = /\/issue\/(\d+)/.exec(input)![1];
    const data = issue(id); data.fields.status.name = statuses[Number(id) - 1];
    return Response.json(data);
  });
  const result = await setMissingFixVersions(config, version, ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(result.updated, []);
  assert.equal(result.failed.length, 6);
  for (const failure of result.failed) assert.match(failure.error, /status is excluded from Fix version/);
});

test("bulk edits resolve each project's own version ID across pages, share lookups, and update duplicates once", async (t) => {
  const writes: Array<{ id: string; versionId: string }> = [];
  const lookups: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer test-token");
    const url = new URL(input);
    if (url.pathname.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const project = /\/project\/(\d+)\/version/.exec(url.pathname)?.[1];
    if (project) {
      const startAt = Number(url.searchParams.get("startAt"));
      lookups.push(`${project}:${startAt}`);
      return Response.json({ startAt, isLast: startAt === 1, values: [startAt === 0
        ? { id: "wrong", name: "2026.10.20-0" } : { id: `version-${project}`, name: version }] });
    }
    const id = /\/issue\/(\d+)/.exec(input)![1];
    assert.ok(["1", "2", "3", "4", "5", "6"].includes(id));
    if (init.method === "PUT") {
      const body = JSON.parse(init.body as string);
      const versionId = body.update.fixVersions[0].add.id;
      assert.deepEqual(body, { update: { fixVersions: [{ add: { id: id === "2" ? "version-200" : "version-100" } }] } });
      writes.push({ id, versionId });
      return new Response(null, { status: 204 });
    }
    assert.equal(init.cache, "no-store");
    assert.equal(url.searchParams.get("fields"), "summary,status,assignee,fixVersions,project");
    return Response.json(issue(id, id === "2" ? "200" : "100"));
  });
  const result = await setMissingFixVersions(config, ` ${version} `, ["1", "2", "3", "1", "4", "5", "6"]);
  assert.equal(writes.length, 6);
  assert.deepEqual(lookups.sort(), ["100:0", "100:1", "200:0", "200:1"]);
  assert.deepEqual(result.updated.map(({ id }) => id), ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(result.failed, []);
});

test("fresh details reject reassigned, unassigned, completed, and already-versioned tickets without writes", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    assert.notEqual(init.method, "PUT");
    assert.ok(!input.includes("/project/"));
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const id = /\/issue\/(\d+)/.exec(input)![1];
    const data = issue(id);
    if (id === "1") data.fields.assignee = { accountId: "other-user" };
    if (id === "2") data.fields.assignee = null;
    if (id === "3") data.fields.status = { name: "Archived", statusCategory: { key: "done" } };
    if (id === "4") data.fields.fixVersions = [{ name: "2026.10.20-0" }];
    return Response.json(data);
  });
  const result = await setMissingFixVersions(config, version, ["1", "2", "3", "4"]);
  assert.deepEqual(result.updated, []);
  assert.deepEqual(result.failed.map(({ id }) => id), ["1", "2", "3", "4"]);
  assert.match(result.failed[0].error, /no longer open and assigned/);
  assert.match(result.failed[3].error, /already has a fix version/);
});

test("retrying a ticket with the selected version succeeds without writing again", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    assert.notEqual(init.method, "PUT");
    assert.ok(!input.includes("/project/"));
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const data = issue("1"); data.fields.fixVersions = [{ name: version }];
    return Response.json(data);
  });
  const result = await setMissingFixVersions(config, version, ["1"]);
  assert.deepEqual(result.updated.map(({ id }) => id), ["1"]);
  assert.deepEqual(result.failed, []);
});

test("missing or archived project versions and rejected or uncertain edits retain other successes", async (t) => {
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const project = /\/project\/(\d+)\/version/.exec(input)?.[1];
    if (project) return Response.json({ startAt: 0, isLast: true, values: project === "1" ? [] : [{ id: `version-${project}`, name: version, archived: project === "2" }] });
    const id = /\/issue\/(\d+)/.exec(input)![1];
    if (init.method === "PUT") {
      writes.push(id);
      if (id === "3") return new Response(null, { status: 403 });
      if (id === "4") throw new TypeError("Network failure");
      return new Response(null, { status: 204 });
    }
    return Response.json(issue(id, id));
  });
  const result = await setMissingFixVersions(config, version, ["1", "2", "3", "4", "5"]);
  assert.deepEqual(writes, ["3", "4", "5"]);
  assert.deepEqual(result.updated.map(({ id }) => id), ["5"]);
  assert.deepEqual(result.failed.map(({ id }) => id), ["1", "2", "3", "4"]);
  assert.match(result.failed[0].error, /not available in PROJECT-1/);
  assert.match(result.failed[1].error, /not available in PROJECT-2/);
  assert.match(result.failed[2].error, /rejected the fix version \(403\)/);
  assert.match(result.failed[3].error, /Could not confirm/);
});

test("invalid input and unknown Jira identity cannot modify tickets", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (input: string) => {
    assert.ok(input.endsWith("/myself"));
    return Response.json({});
  });
  for (const [fixVersion, ids] of [["", ["1"]], ["not-a-version", ["1"]], [version, []], [version, ["../1"]]] as const) {
    await assert.rejects(setMissingFixVersions(config, fixVersion, [...ids]), /required/);
  }
  assert.equal(fetch.mock.callCount(), 0);
  await assert.rejects(setMissingFixVersions(config, version, ["1"]), /verify the Jira user/);
  assert.equal(fetch.mock.callCount(), 1);
});
