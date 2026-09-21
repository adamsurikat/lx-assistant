// Shared types + geometry helpers for the Map page's annotations. The
// records themselves live in the database (MapPort/MapDepot/MapRoute in
// prisma/schema.prisma) and are fetched via /api/map/*; these lightweight
// interfaces mirror just the fields the frontend needs, so components don't
// have to import Prisma's generated types (which include Date fields that
// come back as strings once serialized over JSON).

export interface FeatureFlagRecord {
  id: string;
  name: string;
  color: string;
}

export interface MapPortRecord {
  id: string;
  name: string;
  code: string;
  tenant: string;
  country: string;
  description: string;
  lat: number;
  lng: number;
  featureFlags?: FeatureFlagRecord[];
}

export interface MapDepotRecord {
  id: string;
  name: string;
  code: string;
  country: string;
  description: string;
  tenant: string;
  lat: number;
  lng: number;
  featureFlags?: FeatureFlagRecord[];
}

export interface MapRouteRecord {
  id: string;
  name: string;
  description: string;
  startPortId: string;
  endPortId: string;
  control1Lat: number;
  control1Lng: number;
  control2Lat: number;
  control2Lng: number;
  featureFlags?: FeatureFlagRecord[];
}

// Builds a cubic bezier curve between two [lat, lng] points so routes can be
// drawn as smooth arcs instead of straight lines. Leaflet's Polyline only
// draws straight segments between waypoints, so we sample the curve into a
// series of points and render those. `control1`/`control2` are the two
// bezier control points that shape the curve (e.g. bowing it around land).
export function cubicBezier(
  start: [number, number],
  end: [number, number],
  control1: [number, number],
  control2: [number, number],
  segments = 32,
): [number, number][] {
  const [lat0, lng0] = start;
  const [lat1, lng1] = control1;
  const [lat2, lng2] = control2;
  const [lat3, lng3] = end;

  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const lat =
      mt * mt * mt * lat0 +
      3 * mt * mt * t * lat1 +
      3 * mt * t * t * lat2 +
      t * t * t * lat3;
    const lng =
      mt * mt * mt * lng0 +
      3 * mt * mt * t * lng1 +
      3 * mt * t * t * lng2 +
      t * t * t * lng3;
    points.push([lat, lng]);
  }
  return points;
}

// Samples a route's bezier curve for rendering as a Polyline. `startPort`/
// `endPort` are the current (possibly just-dragged) port records the route
// is anchored to — always look these up live from the ports list rather
// than caching them on the route, so dragging a port immediately drags any
// route endpoints attached to it.
export function routeToPath(
  route: MapRouteRecord,
  startPort: MapPortRecord,
  endPort: MapPortRecord,
): [number, number][] {
  return cubicBezier(
    [startPort.lat, startPort.lng],
    [endPort.lat, endPort.lng],
    [route.control1Lat, route.control1Lng],
    [route.control2Lat, route.control2Lng],
  );
}
