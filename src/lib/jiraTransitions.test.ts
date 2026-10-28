import assert from "node:assert/strict";
import { test } from "node:test";
import { moveStagingTicketsToAcceptance, moveAcceptanceTicketsToRelease, moveProductionTicketsToDone, type JiraUserConfig } from "./jira";

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
      { id: "unnecessary-test", to: { name: "Ready for Test" } },
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

test("staging follows each ticket's Ready for Test step and reloads its transitions before acceptance", async (t) => {
  const statuses = new Map<string, string>();
  const calls = new Map<string, string[]>();
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const id = /\/issue\/(\d+)/.exec(input)![1];
    assert.ok(["1", "2"].includes(id));
    const status = statuses.get(id) ?? "In Progress";
    const readyForTest = id === "1" ? "Ready for Test" : " READY FOR TEST ";
    const atTest = status === readyForTest;
    const history = calls.get(id) ?? [];
    calls.set(id, history);
    if (init.method === "POST") {
      const transitionId = JSON.parse(init.body as string).transition.id;
      assert.equal(transitionId, `${atTest ? "accept" : "test"}-${id}`);
      history.push(transitionId);
      statuses.set(id, atTest ? "Ready for Acceptance" : readyForTest);
      return new Response(null, { status: 204 });
    }
    assert.equal(init.cache, "no-store");
    if (input.endsWith("/transitions")) {
      history.push("transitions");
      return Response.json({ transitions: [
        { id: "wrong", name: "Ready for Test", to: { name: "Done" } },
        { id: `${atTest ? "accept" : "test"}-${id}`, name: "Next step", to: {
          name: atTest ? "Ready for Acceptance" : readyForTest, statusCategory: { key: "indeterminate" },
        } },
      ] });
    }
    history.push("issue");
    return Response.json(issue(id, status));
  });
  const result = await moveStagingTicketsToAcceptance(config, version, ["1", "2", "1"]);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.updated.map(({ id, status }) => ({ id, status })), [
    { id: "1", status: "Ready for Acceptance" }, { id: "2", status: "Ready for Acceptance" },
  ]);
  for (const id of ["1", "2"]) {
    assert.deepEqual(calls.get(id), ["issue", "transitions", `test-${id}`, "issue", "transitions", `accept-${id}`]);
  }
});

test("an unavailable second step reports intermediate progress and a retry resumes from Ready for Test", async (t) => {
  let status = "In Progress";
  let allowAcceptance = false;
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    if (init.method === "POST") {
      const transitionId = JSON.parse(init.body as string).transition.id;
      writes.push(transitionId);
      assert.ok(writes.length <= 2, "Must not loop through Ready for Test");
      status = transitionId === "test" ? "Ready for Test" : "Ready for Acceptance";
      return new Response(null, { status: 204 });
    }
    if (input.endsWith("/transitions")) return Response.json({ transitions: [
      { id: "test", to: { name: "Ready for Test" } },
      ...(allowAcceptance ? [{ id: "accept", to: { name: "Ready for Acceptance" } }] : []),
    ] });
    return Response.json(issue("1", status));
  });
  const partial = await moveStagingTicketsToAcceptance(config, version, ["1"]);
  assert.deepEqual(writes, ["test"]);
  assert.deepEqual(partial.updated, []);
  assert.match(partial.failed[0].error, /Reached Ready for Test.*No transition to Ready for Acceptance/);
  assert.equal(partial.failed[0].ticket?.status, "Ready for Test");

  const stillBlocked = await moveStagingTicketsToAcceptance(config, version, ["1"]);
  assert.deepEqual(writes, ["test"], "An existing Ready for Test status must not be repeated");
  assert.equal(stillBlocked.failed.length, 1);

  allowAcceptance = true;
  const retried = await moveStagingTicketsToAcceptance(config, version, ["1"]);
  assert.deepEqual(writes, ["test", "accept"]);
  assert.deepEqual(retried.failed, []);
  assert.equal(retried.updated[0].status, "Ready for Acceptance");
});

test("staging rechecks scope and status after the intermediate step before another write", async (t) => {
  for (const changed of ["assignee", "fixVersion", "laterStatus", "alreadyAccepted"]) {
    await t.test(changed, async (t) => {
      let moved = false;
      const writes: string[] = [];
      t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
        if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
        if (init.method === "POST") {
          writes.push(JSON.parse(init.body as string).transition.id);
          assert.equal(moved, false, "The refreshed issue must prevent another write");
          moved = true;
          return new Response(null, { status: 204 });
        }
        if (input.endsWith("/transitions")) return Response.json({ transitions: [
          { id: "test", to: { name: "Ready for Test" } },
        ] });
        const data = issue("1", moved ? "Ready for Test" : "In Progress");
        if (moved && changed === "assignee") data.fields.assignee = { accountId: "someone-else" };
        if (moved && changed === "fixVersion") data.fields.fixVersions = [];
        if (moved && changed === "laterStatus") data.fields.status.name = "Ready for Release";
        if (moved && changed === "alreadyAccepted") data.fields.status.name = "Ready for Acceptance";
        return Response.json(data);
      });
      const result = await moveStagingTicketsToAcceptance(config, version, ["1"]);
      assert.deepEqual(writes, ["test"]);
      if (changed === "alreadyAccepted") {
        assert.deepEqual(result.failed, []);
        assert.equal(result.updated[0].status, "Ready for Acceptance");
      } else {
        assert.deepEqual(result.updated, []);
        assert.match(result.failed[0].error, /Reached Ready for Test.*no longer/);
        assert.equal(result.failed[0].ticket?.status, changed === "laterStatus" ? "Ready for Release" : "Ready for Test");
      }
    });
  }
});

test("intermediate workflow failures retain other successes and never retry a rejected or uncertain write", async (t) => {
  const statuses = new Map<string, string>();
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const id = /\/issue\/(\d+)/.exec(input)![1];
    const atTest = statuses.get(id) === "Ready for Test";
    if (init.method === "POST") {
      writes.push(`${id}:${atTest ? "accept" : "test"}`);
      if (id === "1" || (id === "2" && atTest)) return new Response(null, { status: 400 });
      if (id === "3" && atTest) throw new TypeError("fetch failed");
      if (id === "4") throw new DOMException("Timed out", "TimeoutError");
      statuses.set(id, atTest ? "Ready for Acceptance" : "Ready for Test");
      return new Response(null, { status: 204 });
    }
    if (input.endsWith("/transitions")) return Response.json({ transitions: [
      { id: atTest ? "accept" : "test", to: { name: atTest ? "Ready for Acceptance" : "Ready for Test" } },
    ] });
    return Response.json(issue(id, statuses.get(id)));
  });
  const result = await moveStagingTicketsToAcceptance(config, version, ["1", "2", "3", "4", "5"]);
  assert.deepEqual(result.updated.map(({ id }) => id), ["5"]);
  assert.deepEqual(result.failed.map(({ id }) => id), ["1", "2", "3", "4"]);
  assert.equal(result.failed[0].ticket, undefined);
  assert.match(result.failed[0].error, /rejected the transition/);
  assert.match(result.failed[1].error, /Reached Ready for Test.*required fields/);
  assert.match(result.failed[2].error, /Reached Ready for Test.*Could not confirm/);
  assert.equal(result.failed[1].ticket?.status, "Ready for Test");
  assert.equal(result.failed[2].ticket?.status, "Ready for Test");
  assert.equal(result.failed[3].ticket, undefined);
  assert.match(result.failed[3].error, /Could not confirm/);
  assert.deepEqual(writes.sort(), ["1:test", "2:accept", "2:test", "3:accept", "3:test", "4:test", "5:accept", "5:test"]);
});

test("acceptance and production do not take the staging intermediate step", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    assert.notEqual(init.method, "POST");
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    if (input.endsWith("/transitions")) return Response.json({ transitions: [
      { id: "test", to: { name: "Ready for Test" } },
    ] });
    const id = /\/issue\/(\d+)/.exec(input)![1];
    return Response.json(issue(id, id === "1" ? "Ready for Acceptance" : "Ready for Release"));
  });
  for (const result of [
    await moveAcceptanceTicketsToRelease(config, version, ["1"]),
    await moveProductionTicketsToDone(config, version, ["2"]),
  ]) {
    assert.deepEqual(result.updated, []);
    assert.match(result.failed[0].error, /No transition/);
  }
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
  const actions = [moveStagingTicketsToAcceptance, moveAcceptanceTicketsToRelease, moveProductionTicketsToDone];
  for (const action of actions) {
    for (const [fixVersion, ids] of [["", ["1"]], [version, []], [version, ["../1"]]] as const) {
      await assert.rejects(action(config, fixVersion, [...ids]), /required/);
    }
  }
  assert.equal(fetch.mock.callCount(), 0);
  for (const action of actions) {
    await assert.rejects(action(config, version, ["1"]), /verify the Jira user/);
  }
  assert.equal(fetch.mock.callCount(), actions.length);
});

test("acceptance moves selected tickets to either release status using their available destination, not transition name", async (t) => {
  const destinations: Record<string, string> = { "1": "Resolved", "2": "Ready for Release", "3": " resolved " };
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const id = /\/issue\/(\d+)/.exec(input)![1];
    assert.ok(destinations[id], "Unselected tickets must not be requested");
    if (init.method === "POST") {
      assert.deepEqual(JSON.parse(init.body as string), { transition: { id: `accept-${id}` } });
      writes.push(id);
      return new Response(null, { status: 204 });
    }
    assert.equal(init.cache, "no-store");
    if (input.endsWith("/transitions")) return Response.json({ transitions: [
      { id: "wrong", name: "Resolved", to: { name: "Done" } },
      { id: `accept-${id}`, name: "Accept", to: { name: destinations[id], statusCategory: { key: "done" } } },
    ] });
    return Response.json(issue(id, id === "3" ? " READY FOR ACCEPTANCE " : "Ready for Acceptance"));
  });
  const result = await moveAcceptanceTicketsToRelease(config, ` ${version} `, ["1", "2", "3", "1"]);
  assert.deepEqual(writes, ["1", "2", "3"]);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.updated.map(({ id, status, statusCategory }) => ({ id, status, statusCategory })), [
    { id: "1", status: "Resolved", statusCategory: "done" },
    { id: "2", status: "Ready for Release", statusCategory: "done" },
    { id: "3", status: " resolved ", statusCategory: "done" },
  ]);
});

test("acceptance rechecks scope and source status, and retries either release status without another transition", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    assert.notEqual(init.method, "POST");
    assert.ok(!input.endsWith("/transitions"));
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const id = /\/issue\/(\d+)/.exec(input)![1];
    const data = issue(id, "Ready for Acceptance");
    if (id === "1") data.fields.assignee = { accountId: "other-user" };
    if (id === "2") data.fields.assignee = null;
    if (id === "3") data.fields.fixVersions = [{ name: "other-version" }];
    const statuses: Record<string, string> = {
      "4": "In Progress", "5": "Done", "6": "Closed", "7": "Canceled", "8": "Resolved", "9": "Ready for Release",
    };
    if (statuses[id]) data.fields.status = { name: statuses[id], statusCategory: { key: "done" } };
    return Response.json(data);
  });
  const result = await moveAcceptanceTicketsToRelease(config, version, ["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  assert.deepEqual(result.updated.map(({ id }) => id), ["8", "9"]);
  assert.deepEqual(result.failed.map(({ id }) => id), ["1", "2", "3", "4", "5", "6", "7"]);
  assert.ok(result.failed.slice(0, 3).every(({ error }) => error.includes("no longer assigned")));
  assert.ok(result.failed.slice(3).every(({ error }) => error.includes("no longer Ready for Acceptance")));
});

test("acceptance retains successes alongside missing transitions, rejected writes, and uncertain responses", async (t) => {
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const id = /\/issue\/(\d+)/.exec(input)![1];
    if (init.method === "POST") {
      writes.push(id);
      if (id === "2") return new Response(null, { status: 403 });
      if (id === "3") throw new TypeError("fetch failed");
      return new Response(null, { status: 204 });
    }
    if (input.endsWith("/transitions")) return Response.json({ transitions: [
      { id: "31", to: { name: id === "1" ? "Closed" : "Ready for Release" } },
    ] });
    return Response.json(issue(id, "Ready for Acceptance"));
  });
  const result = await moveAcceptanceTicketsToRelease(config, version, ["1", "2", "3", "4"]);
  assert.deepEqual(writes, ["2", "3", "4"]);
  assert.deepEqual(result.updated.map(({ id }) => id), ["4"]);
  assert.deepEqual(result.failed.map(({ id }) => id), ["1", "2", "3"]);
  assert.match(result.failed[0].error, /No transition to Resolved or Ready for Release/);
  assert.match(result.failed[1].error, /rejected the transition \(403\)/);
  assert.match(result.failed[2].error, /Could not confirm/);
});

test("production closes SURHD tickets and moves every other project to Done using the current Jira key", async (t) => {
  const keys: Record<string, string> = { "1": "SURHD-100", "2": "APP-200", "3": "SURHDX-300", "4": "SURHD-400" };
  const writes: Array<{ id: string; transition: string }> = [];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const id = /\/issue\/(\d+)/.exec(input)![1];
    assert.ok(keys[id], "Unselected tickets must not be requested");
    if (init.method === "POST") {
      writes.push({ id, transition: JSON.parse(init.body as string).transition.id });
      return new Response(null, { status: 204 });
    }
    if (input.endsWith("/transitions")) return Response.json({ transitions: [
      { id: `done-${id}`, name: "Closed", to: { name: "Done", statusCategory: { key: "done" } } },
      { id: `closed-${id}`, name: "Done", to: { name: "Closed", statusCategory: { key: "done" } } },
    ] });
    const data = issue(id, id === "1" || id === "2" ? "Resolved" : "Ready for Release");
    data.key = keys[id];
    if (data.fields.status.name === "Resolved") data.fields.status.statusCategory.key = "done";
    return Response.json(data);
  });
  const result = await moveProductionTicketsToDone(config, version, ["1", "2", "3", "4", "1"]);
  assert.deepEqual(writes, [
    { id: "1", transition: "closed-1" }, { id: "2", transition: "done-2" },
    { id: "3", transition: "done-3" }, { id: "4", transition: "closed-4" },
  ]);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.updated.map(({ key, status }) => ({ key, status })), [
    { key: "SURHD-100", status: "Closed" }, { key: "APP-200", status: "Done" },
    { key: "SURHDX-300", status: "Done" }, { key: "SURHD-400", status: "Closed" },
  ]);
});

test("production reports missing or rejected transitions without substituting a different completion status", async (t) => {
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const id = /\/issue\/(\d+)/.exec(input)![1];
    if (init.method === "POST") {
      writes.push(id);
      if (id === "3") return new Response(null, { status: 403 });
      if (id === "5") throw new DOMException("Timed out", "TimeoutError");
      return new Response(null, { status: 204 });
    }
    if (input.endsWith("/transitions")) return Response.json({ transitions: [
      { id: "31", to: { name: id === "2" ? "Closed" : "Done" } },
    ] });
    const data = issue(id, "Ready for Release");
    if (id === "1") data.key = "SURHD-1";
    return Response.json(data);
  });
  const result = await moveProductionTicketsToDone(config, version, ["1", "2", "3", "4", "5"]);
  assert.deepEqual(writes, ["3", "4", "5"]);
  assert.deepEqual(result.updated.map(({ id }) => id), ["4"]);
  assert.deepEqual(result.failed.map(({ id }) => id), ["1", "2", "3", "5"]);
  assert.match(result.failed[0].error, /No transition to Closed/);
  assert.match(result.failed[1].error, /No transition to Done/);
  assert.match(result.failed[2].error, /rejected the transition \(403\)/);
  assert.match(result.failed[3].error, /Could not confirm/);
});

test("production rechecks scope and eligible statuses, and retries completed tickets without another write", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    assert.notEqual(init.method, "POST");
    assert.ok(!input.endsWith("/transitions"));
    if (input.endsWith("/myself")) return Response.json({ accountId: "current-user" });
    const id = /\/issue\/(\d+)/.exec(input)![1];
    const data = issue(id, "Resolved");
    if (id === "1") data.fields.assignee = { accountId: "other-user" };
    if (id === "2") data.fields.fixVersions = [{ name: "other-version" }];
    if (id === "3") data.fields.status.name = "Ready for Acceptance";
    if (id === "4") data.fields.status = { name: "Canceled", statusCategory: { key: "done" } };
    if (id === "5" || id === "7") data.key = `SURHD-${id}`;
    if (id === "5" || id === "8") data.fields.status.name = "Done";
    if (id === "6" || id === "7") data.fields.status.name = "Closed";
    if (id === "9") data.fields.assignee = null;
    return Response.json(data);
  });
  const result = await moveProductionTicketsToDone(config, version, ["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  assert.deepEqual(result.updated.map(({ id }) => id), ["7", "8"]);
  assert.deepEqual(result.failed.map(({ id }) => id), ["1", "2", "3", "4", "5", "6", "9"]);
});
