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
