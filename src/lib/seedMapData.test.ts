import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test, type TestContext } from "node:test";
import { PrismaClient } from "@prisma/client";
import { parseMapGeoJSON } from "./mapGeoJSON";
import { seedMapDataIfEmpty } from "./seedMapData";

let directory: string;
let databaseNumber = 0;

before(() => {
  directory = mkdtempSync(join(tmpdir(), "lx-map-seed-"));
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: `file:${join(directory, "template.db")}` },
    stdio: "pipe",
  });
});

after(() => rmSync(directory, { recursive: true, force: true }));

function database(t: TestContext) {
  const path = join(directory, `${++databaseNumber}.db`);
  copyFileSync(join(directory, "template.db"), path);
  const prisma = new PrismaClient({ datasources: { db: { url: `file:${path}` } } });
  t.after(() => prisma.$disconnect());
  return prisma;
}

async function mapCounts(prisma: PrismaClient) {
  return Promise.all([prisma.mapPort.count(), prisma.mapDepot.count(), prisma.mapRoute.count()]);
}

test("seeds the bundled map into an existing empty-map database and preserves it on restart", async (t) => {
  const prisma = database(t);
  const user = await prisma.user.create({ data: { email: "map-seed@example.test" } });
  const parsed = parseMapGeoJSON(JSON.parse(readFileSync("prisma/mapData.geojson", "utf8")));
  // The snapshot contains shared port codes; the existing importer keeps
  // the first port for each code (or name when there is no code).
  const portCount = new Set(parsed.ports.map((port) => port.code || port.name)).size;

  const result = await seedMapDataIfEmpty(prisma);
  assert.deepEqual(result, {
    portsCreated: portCount, portsSkipped: parsed.ports.length - portCount,
    depotsCreated: parsed.depots.length, depotsSkipped: 0,
    routesCreated: parsed.routes.length, routesSkipped: 0,
  });
  assert.deepEqual(await mapCounts(prisma), [portCount, parsed.depots.length, parsed.routes.length]);
  assert.equal(await prisma.mapDepotFeatureFlag.count(), parsed.depots.reduce((sum, depot) => sum + depot.featureFlags.length, 0));
  assert.deepEqual(await prisma.user.findUnique({ where: { id: user.id } }), user);

  const port = await prisma.mapPort.findFirstOrThrow();
  await prisma.mapPort.update({ where: { id: port.id }, data: { name: "User's edited port" } });
  const depot = await prisma.mapDepot.findFirstOrThrow();
  await prisma.mapDepot.delete({ where: { id: depot.id } });
  assert.equal(await seedMapDataIfEmpty(prisma), null);
  assert.equal((await prisma.mapPort.findUniqueOrThrow({ where: { id: port.id } })).name, "User's edited port");
  assert.deepEqual(await mapCounts(prisma), [portCount, parsed.depots.length - 1, parsed.routes.length]);
});

for (const kind of ["port", "depot"] as const) {
  test(`preserves a map containing only a custom ${kind}`, async (t) => {
    const prisma = database(t);
    const data = { name: "Custom location", country: "SE", lat: 57, lng: 12 };
    const existing = kind === "port"
      ? await prisma.mapPort.create({ data })
      : await prisma.mapDepot.create({ data });

    assert.equal(await seedMapDataIfEmpty(prisma, join(directory, "missing.geojson")), null);
    assert.deepEqual(await mapCounts(prisma), kind === "port" ? [1, 0, 0] : [0, 1, 0]);
    const saved = kind === "port" ? await prisma.mapPort.findFirst() : await prisma.mapDepot.findFirst();
    assert.deepEqual(saved, existing);
  });
}

test("rolls back a failed import completely so startup can retry", async (t) => {
  const prisma = database(t);
  const path = join(directory, "invalid.geojson");
  writeFileSync(path, JSON.stringify({
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [12, 57] }, properties: { kind: "port", name: "First port" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [13, 58] }, properties: { kind: "port", name: "Invalid port", featureFlags: ["gos", "gos"] } },
    ],
  }));

  await assert.rejects(seedMapDataIfEmpty(prisma, path), { code: "P2002" });
  assert.deepEqual(await mapCounts(prisma), [0, 0, 0]);
  assert.equal(await prisma.mapPortFeatureFlag.count(), 0);
  assert.ok(await seedMapDataIfEmpty(prisma));
});

test("reports a missing seed file without writing to an empty map", async (t) => {
  const prisma = database(t);
  await assert.rejects(seedMapDataIfEmpty(prisma, join(directory, "missing.geojson")), { code: "ENOENT" });
  assert.deepEqual(await mapCounts(prisma), [0, 0, 0]);
});

test("concurrent server starts seed the database only once", async (t) => {
  const path = join(directory, "concurrent.db");
  copyFileSync(join(directory, "template.db"), path);
  const clients = [0, 1].map(() => new PrismaClient({ datasources: { db: { url: `file:${path}` } } }));
  t.after(() => Promise.all(clients.map((prisma) => prisma.$disconnect())));

  const results = await Promise.all(clients.map((prisma) => seedMapDataIfEmpty(prisma)));
  assert.equal(results.filter((result) => result === null).length, 1);
  const imported = results.find((result) => result !== null)!;
  assert.deepEqual(await mapCounts(clients[0]), [imported.portsCreated, imported.depotsCreated, imported.routesCreated]);
});
