// Converts the Map page's annotations (MapPort/MapDepot/MapRoute) to and
// from a plain GeoJSON FeatureCollection, so the whole map can be exported
// as a single portable file and re-imported to bootstrap a fresh database
// (see /api/map/export, /api/map/import, and prisma/importMapGeoJSON.ts).
//
// Ports/depots become Point features; routes become LineString features
// whose geometry is just the [start, end] coordinates (for compatibility
// with any generic GeoJSON viewer) with the two bezier control points that
// bow the curve kept as extra properties, since GeoJSON has no native
// concept of a curved line. Routes reference their start/end port by code
// (falling back to name) rather than by database id, since ids aren't
// portable across databases.

export interface MapGeoJSONPortProps {
  kind: "port";
  name: string;
  code: string;
  tenant: string;
  country: string;
  description: string;
}

export interface MapGeoJSONDepotProps {
  kind: "depot";
  name: string;
  code: string;
  tenant: string;
  country: string;
  description: string;
}

export interface MapGeoJSONRouteProps {
  kind: "route";
  name: string;
  description: string;
  // Identifies the start/end port by code (or name, if it has no code) so
  // the reference survives a round trip through a fresh database where ids
  // won't match. Resolved back to a port id at import time.
  startPort: string;
  endPort: string;
  control1: [lng: number, lat: number];
  control2: [lng: number, lat: number];
}

export type MapGeoJSONFeature =
  | { type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: MapGeoJSONPortProps }
  | { type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: MapGeoJSONDepotProps }
  | {
      type: "Feature";
      geometry: { type: "LineString"; coordinates: [number, number][] };
      properties: MapGeoJSONRouteProps;
    };

export interface MapGeoJSONCollection {
  type: "FeatureCollection";
  features: MapGeoJSONFeature[];
}

interface PortLike {
  id: string;
  name: string;
  code: string;
  tenant: string;
  country: string;
  description: string;
  lat: number;
  lng: number;
}

interface DepotLike {
  id: string;
  name: string;
  code: string;
  tenant: string;
  country: string;
  description: string;
  lat: number;
  lng: number;
}

interface RouteLike {
  name: string;
  description: string;
  startPortId: string;
  endPortId: string;
  control1Lat: number;
  control1Lng: number;
  control2Lat: number;
  control2Lng: number;
}

// A port/depot's "identifier" used to link routes to ports in the exported
// file: its code if it has one, otherwise its name. Both models enforce
// this is unique in practice (codes are short site codes like "BELF"; names
// are the marker's display label), though nothing stops two rows sharing a
// name — import falls back to matching the first one found.
function portIdentifier(port: { code: string; name: string }): string {
  return port.code.trim() || port.name;
}

export function mapDataToGeoJSON(
  ports: PortLike[],
  depots: DepotLike[],
  routes: RouteLike[],
): MapGeoJSONCollection {
  const portsById = new Map(ports.map((p) => [p.id, p]));

  const portFeatures: MapGeoJSONFeature[] = ports.map((port) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [port.lng, port.lat] },
    properties: {
      kind: "port",
      name: port.name,
      code: port.code,
      tenant: port.tenant,
      country: port.country,
      description: port.description,
    },
  }));

  const depotFeatures: MapGeoJSONFeature[] = depots.map((depot) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [depot.lng, depot.lat] },
    properties: {
      kind: "depot",
      name: depot.name,
      code: depot.code,
      tenant: depot.tenant,
      country: depot.country,
      description: depot.description,
    },
  }));

  const routeFeatures: MapGeoJSONFeature[] = routes.flatMap((route) => {
    const startPort = portsById.get(route.startPortId);
    const endPort = portsById.get(route.endPortId);
    // Skip routes whose port was deleted out from under them (shouldn't
    // normally happen since deleting a port cascades to its routes, but
    // guards against exporting a dangling reference just in case).
    if (!startPort || !endPort) return [];
    return [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [startPort.lng, startPort.lat],
            [endPort.lng, endPort.lat],
          ],
        },
        properties: {
          kind: "route",
          name: route.name,
          description: route.description,
          startPort: portIdentifier(startPort),
          endPort: portIdentifier(endPort),
          control1: [route.control1Lng, route.control1Lat],
          control2: [route.control2Lng, route.control2Lat],
        },
      },
    ];
  });

  return {
    type: "FeatureCollection",
    features: [...portFeatures, ...depotFeatures, ...routeFeatures],
  };
}

export interface ParsedMapGeoJSON {
  ports: Omit<PortLike, "id">[];
  depots: Omit<DepotLike, "id">[];
  // Routes reference ports by the same code-or-name identifier used on
  // export (see portIdentifier above) — resolve these to real ids against
  // the ports you actually created/matched before writing to the database.
  routes: {
    name: string;
    description: string;
    startPort: string;
    endPort: string;
    control1Lat: number;
    control1Lng: number;
    control2Lat: number;
    control2Lng: number;
  }[];
}

// Minimal slice of PrismaClient this module needs — kept as a structural
// type (rather than importing PrismaClient) so this file has no dependency
// on `@prisma/client`'s generated types, just the three delegate methods
// actually used.
interface MapPrismaClient {
  mapPort: {
    findFirst: (args: { where: { code?: string; name?: string } }) => Promise<PortLike | null>;
    create: (args: { data: Omit<PortLike, "id"> }) => Promise<PortLike>;
  };
  mapDepot: {
    findFirst: (args: { where: { code?: string; name?: string } }) => Promise<DepotLike | null>;
    create: (args: { data: Omit<DepotLike, "id"> }) => Promise<DepotLike>;
  };
  mapRoute: {
    findFirst: (args: { where: { name: string; startPortId: string; endPortId: string } }) => Promise<unknown | null>;
    create: (args: { data: RouteLike }) => Promise<unknown>;
  };
}

export interface ImportMapGeoJSONResult {
  portsCreated: number;
  portsSkipped: number;
  depotsCreated: number;
  depotsSkipped: number;
  routesCreated: number;
  routesSkipped: number;
}

// Upserts a parsed GeoJSON export into the database: ports/depots are
// matched against existing rows by code (or name, if codeless) so importing
// the same file twice doesn't create duplicates, then routes are resolved
// against those ports by the same identifier and matched/created the same
// way. Used by both POST /api/map/import and prisma/importMapGeoJSON.ts so
// there's one implementation of the "is this already imported?" logic.
export async function importMapGeoJSON(
  prisma: MapPrismaClient,
  parsed: ParsedMapGeoJSON,
): Promise<ImportMapGeoJSONResult> {
  const result: ImportMapGeoJSONResult = {
    portsCreated: 0,
    portsSkipped: 0,
    depotsCreated: 0,
    depotsSkipped: 0,
    routesCreated: 0,
    routesSkipped: 0,
  };

  // Maps a port/depot's export identifier (code-or-name) to its resolved
  // database id, for looking up route endpoints afterwards.
  const portIdByIdentifier = new Map<string, string>();

  for (const port of parsed.ports) {
    const identifier = portIdentifier(port);
    const existing = port.code
      ? await prisma.mapPort.findFirst({ where: { code: port.code } })
      : await prisma.mapPort.findFirst({ where: { name: port.name } });

    if (existing) {
      portIdByIdentifier.set(identifier, existing.id);
      result.portsSkipped += 1;
      continue;
    }

    const created = await prisma.mapPort.create({ data: port });
    portIdByIdentifier.set(identifier, created.id);
    result.portsCreated += 1;
  }

  for (const depot of parsed.depots) {
    const existing = depot.code
      ? await prisma.mapDepot.findFirst({ where: { code: depot.code } })
      : await prisma.mapDepot.findFirst({ where: { name: depot.name } });

    if (existing) {
      result.depotsSkipped += 1;
      continue;
    }

    await prisma.mapDepot.create({ data: depot });
    result.depotsCreated += 1;
  }

  for (const route of parsed.routes) {
    const startPortId = portIdByIdentifier.get(route.startPort);
    const endPortId = portIdByIdentifier.get(route.endPort);
    // Can't create a route without both real ports resolved — skip rather
    // than fail the whole import over one bad reference.
    if (!startPortId || !endPortId) {
      result.routesSkipped += 1;
      continue;
    }

    const existing = await prisma.mapRoute.findFirst({
      where: { name: route.name, startPortId, endPortId },
    });
    if (existing) {
      result.routesSkipped += 1;
      continue;
    }

    await prisma.mapRoute.create({
      data: {
        name: route.name,
        description: route.description,
        startPortId,
        endPortId,
        control1Lat: route.control1Lat,
        control1Lng: route.control1Lng,
        control2Lat: route.control2Lat,
        control2Lng: route.control2Lng,
      },
    });
    result.routesCreated += 1;
  }

  return result;
}

// Parses a MapGeoJSONCollection (or any plain object shaped like one — e.g.
// freshly JSON.parse'd from a file/request body) back into plain records
// ready to insert, without touching the database itself.
export function parseMapGeoJSON(data: unknown): ParsedMapGeoJSON {
  if (
    typeof data !== "object" ||
    data === null ||
    (data as { type?: unknown }).type !== "FeatureCollection" ||
    !Array.isArray((data as { features?: unknown }).features)
  ) {
    throw new Error("Not a valid GeoJSON FeatureCollection");
  }

  const ports: Omit<PortLike, "id">[] = [];
  const depots: Omit<DepotLike, "id">[] = [];
  const routes: ParsedMapGeoJSON["routes"] = [];

  for (const feature of (data as MapGeoJSONCollection).features) {
    const props = feature?.properties as { kind?: string } | undefined;
    if (!props || !feature.geometry) continue;

    if (props.kind === "port" && feature.geometry.type === "Point") {
      const p = props as MapGeoJSONPortProps;
      const [lng, lat] = feature.geometry.coordinates;
      ports.push({
        name: p.name ?? "",
        code: p.code ?? "",
        tenant: p.tenant ?? "",
        country: p.country ?? "",
        description: p.description ?? "",
        lat,
        lng,
      });
    } else if (props.kind === "depot" && feature.geometry.type === "Point") {
      const d = props as MapGeoJSONDepotProps;
      const [lng, lat] = feature.geometry.coordinates;
      depots.push({
        name: d.name ?? "",
        code: d.code ?? "",
        tenant: d.tenant ?? "",
        country: d.country ?? "",
        description: d.description ?? "",
        lat,
        lng,
      });
    } else if (props.kind === "route" && feature.geometry.type === "LineString") {
      const r = props as MapGeoJSONRouteProps;
      routes.push({
        name: r.name ?? "",
        description: r.description ?? "",
        startPort: r.startPort,
        endPort: r.endPort,
        control1Lat: r.control1[1],
        control1Lng: r.control1[0],
        control2Lat: r.control2[1],
        control2Lng: r.control2[0],
      });
    }
  }

  return { ports, depots, routes };
}
