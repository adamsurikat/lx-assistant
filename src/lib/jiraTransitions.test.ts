import assert from "node:assert/strict";
import { test } from "node:test";
import { moveStagingTicketsToAcceptance, type JiraUserConfig } from "./jira";

const config: JiraUserConfig = {
  mode: "oauth", accessToken: "test-token", cloudId: "test-cloud", siteUrl: "https://jira.example.test",
};
const version = "2026.10.21-0";

function issue(id: string, status = "In Progress") {
  return { id, key: `TEST-${id}`, fields: {
    summary: `Ticket ${id}`, status: { name: status, statusCategory: { key: "indeterminate" } },
    assignee: { accountId: "current-user" } as { accountId: string } | null,
    fixVersions: [{ name: version }],
  } };
}

test("selected tickets use their own transition IDs by destination status, with duplicates updated once", async (t) => {
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    assert.ok(input.startsWith("https://api.atlassian.com/ex/jira/test-cloud/rest/api/3/"));
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer test-token");
    const url = new URL(input);
    if (url.pathname.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const id = /\/issue\/(\d+)/.exec(url.pathname)![1];
    assert.ok(["1", "2"].includes(id), "Unselected tickets must never be requested");
    if (init.method === "POST") {
      assert.deepEqual(JSON.parse(init.body as string), { transition: { id: `transition-${id}` } });
      writes.push(id);
      return new Response(null, { status: 204 });
    }
    assert.equal(init.cache, "no-store");
    if (url.pathname.endsWith("/transitions")) return Response.json({ transitions: [
      { id: "wrong", name: "Ready for Acceptance", to: { name: "Done" } },
      { id: `transition-${id}`, name: "Deploy to staging", to: { name: "Ready for Acceptance", statusCategory: { key: "indeterminate" } } },
    ] });
    assert.equal(url.searchParams.get("fields"), "summary,status,assignee,fixVersions");
    return Response.json(issue(id));
  });
  const result = await moveStagingTicketsToAcceptance(config, ` ${version} `, ["1", "2", "1"]);
  assert.deepEqual(writes.sort(), ["1", "2"]);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.updated.map(({ id, status }) => ({ id, status })), [
    { id: "1", status: "Ready for Acceptance" }, { id: "2", status: "Ready for Acceptance" },
  ]);
});

test("fresh issue details reject other assignees, unassigned tickets, other versions, and later statuses", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    assert.notEqual(init.method, "POST");
    assert.ok(!input.endsWith("/transitions"));
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const id = /\/issue\/(\d+)/.exec(input)![1];
    const data = issue(id);
    if (id === "1") data.fields.assignee = { accountId: "other-user" };
    if (id === "2") data.fields.assignee = null;
    if (id === "3") data.fields.fixVersions = [{ name: "another-version" }];
    if (id === "4") data.fields.status.name = "Ready for Release";
    if (id === "5") data.fields.status.statusCategory.key = "done";
    return Response.json(data);
  });
  const result = await moveStagingTicketsToAcceptance(config, version, ["1", "2", "3", "4", "5"]);
  assert.deepEqual(result.updated, []);
  assert.deepEqual(result.failed.map(({ id }) => id), ["1", "2", "3", "4", "5"]);
  assert.match(result.failed[0].error, /no longer assigned/);
  assert.match(result.failed[3].error, /no longer before acceptance/);
});

test("an already-ready ticket is returned without repeating its transition", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    calls++;
    assert.notEqual(init.method, "POST");
    return Response.json(input.endsWith("/myself") ? { accountId: "current-user" } : issue("1", "Ready for Acceptance"));
  });
  const result = await moveStagingTicketsToAcceptance(config, version, ["1"]);
  assert.equal(calls, 2);
  assert.equal(result.updated[0].status, "Ready for Acceptance");
  assert.deepEqual(result.failed, []);
});

test("partial failures report unavailable transitions, rejected writes, and uncertain responses without losing successes", async (t) => {
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const id = /\/issue\/(\d+)/.exec(input)![1];
    if (init.method === "POST") {
      writes.push(id);
      if (id === "2") return Response.json({ errors: { resolution: "Required" } }, { status: 400 });
      if (id === "3") throw new TypeError("fetch failed");
      return new Response(null, { status: 204 });
    }
    if (input.endsWith("/transitions")) return Response.json({ transitions: id === "1" ? [] : [
      { id: "31", to: { name: "Ready for Acceptance" } },
    ] });
    return Response.json(issue(id));
  });
  const result = await moveStagingTicketsToAcceptance(config, version, ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(result.updated.map(({ id }) => id), ["4", "5", "6"]);
  assert.deepEqual(result.failed.map(({ id }) => id), ["1", "2", "3"]);
  assert.match(result.failed[0].error, /No transition/);
  assert.match(result.failed[1].error, /required fields/);
  assert.match(result.failed[2].error, /Could not confirm/);
  assert.deepEqual(writes.sort(), ["2", "3", "4", "5", "6"]);
});

test("invalid selections and unknown Jira identity never modify tickets", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (input: string) => {
    assert.ok(input.endsWith("/myself"));
    return Response.json({});
  });
  for (const [fixVersion, ids] of [["", ["1"]], [version, []], [version, ["../1"]]] as const) {
    await assert.rejects(moveStagingTicketsToAcceptance(config, fixVersion, [...ids]), /required/);
  }
  assert.equal(fetch.mock.callCount(), 0);
  await assert.rejects(moveStagingTicketsToAcceptance(config, version, ["1"]), /verify the Jira user/);
  assert.equal(fetch.mock.callCount(), 1);
});
