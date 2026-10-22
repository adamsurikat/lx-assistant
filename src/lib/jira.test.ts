import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchJiraFixVersions, fetchStagingDeploymentTickets, type JiraUserConfig } from "./jira";

const config: JiraUserConfig = {
  mode: "token",
  jiraEmail: "test@example.test",
  apiToken: "test-token",
  siteUrl: "https://jira.example.test/",
};

function issue(id: number, status = "In Progress") {
  return { id: String(id), key: `TEST-${id}`, fields: { summary: `Ticket ${id}`, status: { name: status } } };
}

test("staging search loads all pages and excludes only the named statuses", async (t) => {
  const bodies: Array<{ jql: string; nextPageToken?: string }> = [];
  const signal = new AbortController().signal;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://jira.example.test/rest/api/3/search/jql");
    assert.equal(init.method, "POST");
    assert.equal(init.cache, "no-store");
    assert.equal(init.signal, signal);
    bodies.push(JSON.parse(init.body as string));
    return Response.json(bodies.length === 1 ? {
      issues: Array.from({ length: 100 }, (_, index) => issue(index + 1)),
      isLast: false,
      nextPageToken: "page-two",
    } : {
      issues: [
        ...["Ready for Acceptance", "Resolved", "Ready for Release", "Closed", "Done", "Canceled", "DONE"]
          .map((status, index) => issue(101 + index, status)),
        issue(108, "Testing"),
      ],
      isLast: true,
    });
  });

  const tickets = await fetchStagingDeploymentTickets(config, "  1.2.3  ", signal);
  assert.deepEqual(bodies, [
    { jql: 'assignee = currentUser() AND fixVersion = "1.2.3" ORDER BY key ASC', fields: ["summary", "status"], maxResults: 100 },
    { jql: 'assignee = currentUser() AND fixVersion = "1.2.3" ORDER BY key ASC', fields: ["summary", "status"], maxResults: 100, nextPageToken: "page-two" },
  ]);
  assert.equal(tickets.length, 101);
  assert.deepEqual(tickets.at(-1), { id: "108", key: "TEST-108", summary: "Ticket 108", status: "Testing" });
});

test("version quotes and backslashes remain inside one JQL value and OAuth uses the cloud endpoint", async (t) => {
  const version = 'Release "X"\\beta" OR assignee != currentUser()';
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.atlassian.com/ex/jira/test-cloud/rest/api/3/search/jql");
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer test-access-token");
    const { jql } = JSON.parse(init.body as string);
    const match = /^assignee = currentUser\(\) AND fixVersion = ("(?:\\.|[^"\\])*") ORDER BY key ASC$/.exec(jql);
    assert.ok(match, "The fix version must be one quoted literal, never additional JQL clauses");
    assert.equal(JSON.parse(match[1]), version);
    return Response.json({ issues: [], isLast: true });
  });

  assert.deepEqual(await fetchStagingDeploymentTickets({
    mode: "oauth", accessToken: "test-access-token", cloudId: "test-cloud", siteUrl: config.siteUrl,
  }, version), []);
});

test("a blank version never sends an unrestricted Jira search", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected request"); });
  await assert.rejects(fetchStagingDeploymentTickets(config, " \t "), /fix version is required/);
  assert.equal(fetch.mock.callCount(), 0);
});

test("a later page failure does not return a misleading partial ticket list", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => ++calls === 1
    ? Response.json({ issues: [issue(1)], isLast: false, nextPageToken: "page-two" })
    : new Response("Rate limited", { status: 429 }));
  await assert.rejects(fetchStagingDeploymentTickets(config, "1.2.3"), /Jira staging search failed \(429\)/);
});

test("missing or repeating pagination tokens fail instead of truncating or looping", async (t) => {
  for (const nextPageToken of [undefined, "repeated-token"]) {
    const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({
      issues: [issue(1)], isLast: false, nextPageToken,
    }));
    await assert.rejects(fetchStagingDeploymentTickets(config, "1.2.3"), /new page token/);
    assert.equal(fetch.mock.callCount(), nextPageToken ? 2 : 1);
    fetch.mock.restore();
  }
});

test("fix versions include every project and version page, merge shared names, and sort numerically descending", async (t) => {
  const visited: string[] = [];
  const signal = new AbortController().signal;
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    const url = new URL(input);
    const startAt = Number(url.searchParams.get("startAt"));
    visited.push(`${url.pathname}:${startAt}`);
    assert.equal(init.signal, signal);
    assert.equal(init.cache, "no-store");
    assert.equal(new Headers(init.headers).get("Authorization"), `Basic ${Buffer.from("test@example.test:test-token").toString("base64")}`);
    if (url.pathname === "/rest/api/3/project/search") {
      return Response.json({ startAt, isLast: startAt === 1, total: 2, values: [{ id: startAt === 0 ? "10000" : "20000" }] });
    }
    if (url.pathname === "/rest/api/3/project/10000/version") {
      return Response.json({ startAt, isLast: startAt === 2, total: 3, values: startAt === 0
        ? [{ name: "2026.10.21-2" }, { name: "2026.10.21-10" }]
        : [{ name: "2026.10.21-0", released: true }] });
    }
    assert.equal(url.pathname, "/rest/api/3/project/20000/version");
    return Response.json({ startAt, isLast: true, total: 2, values: [
      { name: "2026.10.21-2" }, { name: "2025.01.01-0", archived: true },
    ] });
  });

  assert.deepEqual(await fetchJiraFixVersions(config, signal), ["2026.10.21-10", "2026.10.21-2", "2026.10.21-0", "2025.01.01-0"]);
  assert.deepEqual(visited.sort(), [
    "/rest/api/3/project/search:0", "/rest/api/3/project/search:1",
    "/rest/api/3/project/10000/version:0", "/rest/api/3/project/10000/version:2",
    "/rest/api/3/project/20000/version:0",
  ].sort());
});

test("an account without visible projects has no fix versions", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ values: [], startAt: 0, total: 0, isLast: true }));
  assert.deepEqual(await fetchJiraFixVersions(config), []);
  assert.equal(fetch.mock.callCount(), 1);
});

test("fix versions require a four-digit year, one- or two-digit month/day, and a numeric suffix", async (t) => {
  const allowed = ["2026.10.21-0", "2026.1.2-3", "2026.01.2-12", "2026.1.02-0", "2026.01.02-10"];
  const rejected = [
    "1.2.3", "26.10.21-0", "20260.10.21-0", "2026.001.2-0", "2026.1.002-0",
    "2026.10.21", "2026.10.21-", "2026.10.21-X", "2026.10.21-1-beta",
    "2026-10-21-0", "release-2026.10.21-0", " 2026.10.21-0", "2026.10.21-0 ",
  ];
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => Response.json({
    startAt: 0, isLast: true,
    values: ++calls === 1 ? [{ id: "10000" }] : [...allowed, ...rejected].map((name) => ({ name })),
  }));
  assert.deepEqual(new Set(await fetchJiraFixVersions(config)), new Set(allowed));
});

test("version lookup errors fail instead of returning an incomplete dropdown", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => ++calls === 1
    ? Response.json({ values: [{ id: "10000" }], startAt: 0, total: 1, isLast: true })
    : new Response("Rate limited", { status: 429 }));
  await assert.rejects(fetchJiraFixVersions(config), /Jira version lookup failed \(429\)/);
});

test("version pagination that stops advancing fails instead of looping", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ values: [], startAt: 0, total: 1, isLast: false }));
  await assert.rejects(fetchJiraFixVersions(config), /pagination did not advance/);
});
