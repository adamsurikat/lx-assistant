import assert from "node:assert/strict";
import { test } from "node:test";
import { buildServiceGrid } from "./bookmarkGrid";
import { LINK_FOLDERS, type BookmarkFolder, type BookmarkLink } from "./linksData";

const reactFolder = LINK_FOLDERS.find((folder) => folder.id === "lx-react-client")!;
const reactGrid = buildServiceGrid(reactFolder);

function link(title: string, url = "https://example.test/"): BookmarkLink {
  return { type: "link", title, url };
}

function folder(id: string, links: BookmarkLink[]): BookmarkFolder {
  return { type: "folder", id, title: id, children: links };
}

test("LX React Client groups columns by backend and offers matching frontends first", () => {
  assert.deepEqual(reactGrid.environments, ["Local", "FAT", "Staging", "Prod"]);
  assert.deepEqual(reactGrid.cells.SOT.FAT.frontendChoices?.map((choice) => choice.frontend), [
    "FAT", "Local", "Docker",
  ]);
  assert.equal(reactGrid.cells.SOT.FAT.primary.title, "lx-react-client SOT FAT");
  assert.equal(
    reactGrid.cells.SOT.FAT.frontendChoices?.[1].link.title,
    "lx-react-client SOT Local to FAT",
  );
  assert.deepEqual(reactGrid.cells.SOT.Local.backendVariants, []);
});

test("Stena Prod includes every existing frontend targeting production", () => {
  const choices = reactGrid.cells.Stena.Prod.frontendChoices!;
  assert.deepEqual(choices.map((choice) => choice.frontend), ["Prod", "Local", "Docker", "FAT", "Staging"]);
  assert.deepEqual(choices.map((choice) => choice.link.title), [
    "lx-react-client Stena Prod",
    "lx-react-client Stena Local to Prod",
    "lx-react-client Stena Docker to Prod",
    "lx-react-client Stena FAT to Prod",
    "lx-react-client Stena Staging to Prod",
  ]);
  assert.deepEqual(reactGrid.cells.Stena.FAT.frontendChoices?.map((choice) => choice.frontend), [
    "FAT", "Local", "Docker",
  ]);
});

test("Docker frontends target the Local backend without creating a Docker backend column", () => {
  const dockerLinks = reactFolder.children.filter(
    (node): node is BookmarkLink => node.type === "link" && node.title.endsWith(" DOCKER"),
  );
  assert.ok(dockerLinks.length > 0);
  for (const dockerLink of dockerLinks) {
    const tenant = dockerLink.title.split(" ")[1];
    const choices = reactGrid.cells[tenant].Local.frontendChoices!;
    assert.deepEqual(choices.map((choice) => choice.frontend), ["Local", "Docker"]);
    assert.equal(choices[1].link, dockerLink);
    assert.equal(new URL(dockerLink.url).searchParams.get("api"), "http://localhost:3091");
    assert.equal(reactGrid.cells[tenant].Docker, undefined);
  }
});

test("every LX link and its exact URL remains available exactly once", () => {
  const expected = reactFolder.children.filter((node): node is BookmarkLink => node.type === "link");
  const actual = Object.values(reactGrid.cells).flatMap((tenantCells) =>
    Object.values(tenantCells).flatMap((cell) => cell.frontendChoices!.map((choice) => choice.link)),
  ).concat(reactGrid.other);
  assert.equal(actual.length, expected.length);
  assert.equal(new Set(actual).size, expected.length);
  for (const original of expected) {
    assert.ok(actual.includes(original), `Missing original link: ${original.title}`);
  }
  assert.equal(reactGrid.tenants.length, 9);
  assert.deepEqual(reactGrid.other, []);
});

test("singleton frontends and backend-only variants still produce selectable backend cells", () => {
  const local = link("Client Acme Local");
  const singleton = buildServiceGrid(folder("lx-react-client", [local]));
  assert.deepEqual(singleton.cells.Acme.Local.frontendChoices, [{ frontend: "Local", link: local }]);
  const variant = link("Client Acme Local to Prod");
  const malformed = link("Client Acme Local to Unknown");
  const grid = buildServiceGrid(folder("lx-react-client", [variant, malformed]));
  assert.deepEqual(grid.environments, ["Prod"]);
  assert.deepEqual(grid.cells.Acme.Prod.frontendChoices, [{ frontend: "Local", link: variant }]);
  assert.equal(grid.cells.Acme.Prod.primary, variant);
  assert.deepEqual(grid.other, [malformed]);
  assert.equal(grid.cells.Acme.Local, undefined);
});

test("other services retain frontend columns, backend variants, and unmatched-link fallback", () => {
  const local = link("Client Acme Local");
  const prod = link("Client Acme Prod");
  const variant = link("Client Acme Local to Prod");
  const unmatched = link("Client Other Local to Prod");
  const malformed = link("Client Acme Local to Unknown");
  const grid = buildServiceGrid(folder("another-service", [local, prod, variant, unmatched, malformed]));
  assert.deepEqual(grid.environments, ["Local", "Prod"]);
  assert.deepEqual(grid.cells.Acme.Local, {
    primary: local,
    backendVariants: [{ backend: "Prod", link: variant }],
  });
  assert.deepEqual(grid.cells.Acme.Prod, { primary: prod, backendVariants: [] });
  assert.deepEqual(grid.other, [malformed, unmatched]);
  assert.equal(grid.cells.Other, undefined);
});

test("other services keep their existing EU/APAC tenant labels", () => {
  const eu = link("TAPI FAT");
  const apac = link("TAPI FAT APAC");
  const grid = buildServiceGrid(folder("tapi-admin", [eu, apac]));
  assert.deepEqual(grid.tenants, ["EU", "APAC"]);
  assert.equal(grid.cells.EU.FAT.primary, eu);
  assert.equal(grid.cells.APAC.FAT.primary, apac);
  assert.equal(grid.cells.EU.FAT.frontendChoices, undefined);
});

test("booking frontend choices keep the selected backend and tenant across frontend hosts", () => {
  const booking = LINK_FOLDERS.find((folder) => folder.id === "lx-booking")!;
  const grid = buildServiceGrid(booking);
  assert.equal(grid.backendFirst, true);
  assert.deepEqual(grid.environments, ["Local", "FAT", "Staging", "Prod"]);
  assert.deepEqual(Object.keys(grid.cells.MeerkatFerries), ["Local", "FAT"]);
  const represented: BookmarkLink[] = [];
  for (const [tenant, cells] of Object.entries(grid.cells)) {
    for (const [backend, cell] of Object.entries(cells)) {
      const choices = cell.frontendChoices!;
      const expected = backend === "Local" ? ["Local"]
        : tenant === "MeerkatFerries" ? ["FAT", "Local"]
          : ["Local", "FAT", "Staging", "Prod"];
      assert.deepEqual(choices.map((choice) => choice.frontend).sort(), [...expected].sort());
      for (const { frontend, link: choiceLink } of choices) {
        represented.push(choiceLink);
        const url = new URL(choiceLink.url);
        const selectedEnv = url.searchParams.get("env")
          ?? (url.hostname.includes("fatikat.com") ? "FAT" : url.hostname.includes("stagikat.com") ? "STAGING" : "PROD");
        assert.equal(selectedEnv, backend === "Local" ? "DEV" : backend.toUpperCase());
        if (frontend === "Local") {
          assert.equal(url.origin, "http://localhost:3001");
          assert.equal(url.searchParams.get("tenant"), tenant.toLowerCase());
        } else {
          assert.ok(url.hostname.startsWith(`${tenant.toLowerCase()}.`));
          if (tenant === "SOT" && frontend !== "Prod") {
            assert.ok(url.hostname.includes(".apac."));
            assert.equal(url.searchParams.has("e2e"), true);
          }
        }
      }
    }
  }
  assert.equal(new Set(represented).size, booking.children.length);
  assert.deepEqual(grid.other, []);
});

test("kiosk choices select both GOS backends and preserve the terminal and tenant", () => {
  const kiosk = LINK_FOLDERS.find((folder) => folder.id === "lx-vms-kiosk-fe")!;
  const grid = buildServiceGrid(kiosk);
  assert.equal(grid.backendFirst, true);
  const terminals = [
    { name: "Rødby", code: "ROF", tenant: "scandlines", premise: true, environments: ["Local", "FAT", "Staging"] },
    { name: "Visby", code: "SEVBY", tenant: "dg", premise: false, environments: ["Local"] },
    { name: "Europoort", code: "EURO", tenant: "pof", premise: true, environments: ["Local", "FAT", "Staging"] },
    { name: "Zeebrugge", code: "ZEE", tenant: "pof", premise: true, environments: ["Local", "FAT", "Staging"] },
    { name: "Heysham", code: "HEYS", tenant: "peelports", premise: true, environments: ["Local", "FAT", "Staging"] },
    { name: "Devonport", code: "DPO", tenant: "sot", premise: false, environments: ["Local"] },
    { name: "Belfast VT4", code: "BELF", tenant: "stena", premise: false, environments: ["Local", "FAT", "Staging", "Prod"] },
  ];
  const represented: BookmarkLink[] = [];
  for (const terminal of terminals) {
    const cells = grid.cells[terminal.name];
    assert.deepEqual(Object.keys(cells), terminal.environments);
    for (const [backend, cell] of Object.entries(cells)) {
      const choices = cell.frontendChoices!;
      assert.deepEqual(choices.map((choice) => choice.frontend), backend === "Local" ? ["Local"] : [backend, "Local"]);
      for (const choice of choices) {
        represented.push(choice.link);
        const url = new URL(choice.link.url);
        assert.equal(url.pathname, `/${terminal.code}`);
        assert.equal(url.searchParams.get("tenant"), terminal.tenant);
        const gsu = backend === "Local" ? "http://localhost:8899"
          : backend === "Prod" ? "https://gos.bylynx.com"
            : backend === "Staging" ? "https://gos.lx.stagikat.com"
              : terminal.tenant === "stena" ? "https://stena.gos.lx.fatikat.com" : "https://gos.lx.fatikat.com";
        assert.equal(url.searchParams.get("gsu"), gsu);
        const gpu = !terminal.premise ? null : backend === "Local" ? "http://localhost:1881"
          : `https://${terminal.tenant}.nodered.blx.${backend === "FAT" ? "fatikat" : "stagikat"}.com:1881`;
        assert.equal(url.searchParams.get("gpu"), gpu);
        if (choice.frontend === "Local") {
          assert.equal(url.origin, "http://localhost:3672");
          assert.equal(choice.label, "Local / Docker");
        } else {
          const tenantHost = terminal.tenant === "scandlines" ? "scandlines-hkrifjae" : terminal.tenant;
          const origin = backend === "Prod" ? "https://stenalineports.com"
            : `https://${tenantHost}.lx-vms-kiosk.lx.${backend === "FAT" ? "fatikat" : "stagikat"}.com`;
          assert.equal(url.origin, origin);
        }
      }
    }
  }
  assert.equal(new Set(represented).size, kiosk.children.length);
  assert.deepEqual(grid.other, []);
});
