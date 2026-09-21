"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapPortRecord, MapDepotRecord, MapRouteRecord } from "@/lib/mapTypes";
import { routeToPath, KNOWN_FEATURE_FLAG_NAMES } from "@/lib/mapTypes";

// Ports/depots tagged with one of these tenants get their own brand color
// instead of the default marker color — both on the marker itself and on
// any route running between two ports of the same tenant.
const TENANT_COLORS: Record<string, string> = {
  stenaline: "#ea143d",
  kn: "#003369",
  pof: "#ffce00",
  scandlines: "#003da5",
  peelports: "#e73c32",
  gncl: "#c2c2c2",
  dg: "#a81010",
  sot: "#c8102e",
};
// The tenant value stored in the DB is a lowercase machine key (used for
// color lookups and equality checks); this maps it to the proper display
// name shown in the legend.
const TENANT_LABELS: Record<string, string> = {
  stenaline: "Stena Line",
  kn: "Kuehne-Nagel",
  pof: "P&O Ferries",
  scandlines: "Scandlines",
  peelports: "Peel Ports",
  gncl: "Go Nordic Cruiseline",
  dg: "Destination Gotland",
  sot: "Spirit of Tasmania",
};
function labelForTenant(tenant: string): string {
  return TENANT_LABELS[tenant.toLowerCase()] ?? tenant;
}
const DEFAULT_PORT_COLOR = "#2563eb";
const DEFAULT_DEPOT_COLOR = "#ff5f1f";
const DEFAULT_ROUTE_COLOR = "#111111";
// A shared, stable empty Set — reused wherever "no matches" needs to be
// returned from a useMemo, so the identity doesn't change every render
// (which would otherwise retrigger effects that depend on it).
const EMPTY_ID_SET = new Set<string>();
function colorForTenant(tenant: string, fallback: string): string {
  return TENANT_COLORS[tenant.toLowerCase()] ?? fallback;
}

// Icons are built per color and cached at module scope (rather than one
// icon per marker instance, or recreated every render) since an L.divIcon
// for a given color is pure, immutable, reusable data — not component
// state. Ports and depots use separate caches since their icon shapes
// (badge svg) differ.
const portIconCache = new Map<string, L.DivIcon>();
function getPortIcon(color: string): L.DivIcon {
  let icon = portIconCache.get(color);
  if (!icon) {
    icon = makePortIcon(color);
    portIconCache.set(color, icon);
  }
  return icon;
}
const depotIconCache = new Map<string, L.DivIcon>();
function getDepotIcon(color: string): L.DivIcon {
  let icon = depotIconCache.get(color);
  if (!icon) {
    icon = makeDepotIcon(color);
    depotIconCache.set(color, icon);
  }
  return icon;
}

// Leaflet's default marker icons reference image URLs that don't resolve
// correctly when bundled by webpack, so we build custom colored div-icons
// instead of relying on the default marker images.
function makeIcon(color: string, size = 16, square = false) {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:${square ? "3px" : "50%"};background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.35)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// Ports get a dedicated anchor-badge icon instead of a plain dot, so they
// read as "port" at a glance next to the square depot markers. The
// "port-marker-badge" class drives a CSS-only hover effect (slight scale-up
// + glow) — see .port-marker-badge rules in globals.css.
function makePortIcon(color: string, size = 28) {
  return L.divIcon({
    className: "",
    html: `<span class="port-marker-badge" style="--badge-color:${color};display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white">
      <svg viewBox="0 0 24 24" width="${size * 0.62}" height="${size * 0.62}" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="5" r="2"></circle>
        <line x1="12" y1="7" x2="12" y2="21"></line>
        <path d="M5 12 a7 7 0 0 0 14 0"></path>
        <line x1="5" y1="12" x2="5" y2="15"></line>
        <line x1="19" y1="12" x2="19" y2="15"></line>
        <line x1="8" y1="10" x2="16" y2="10"></line>
      </svg>
    </span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// Depots get a dedicated truck-badge icon (rounded square, same hover
// scale-up + glow treatment as ports via "port-marker-badge") instead of a
// plain colored square, so they read as "depot" at a glance.
function makeDepotIcon(color: string, size = 26) {
  return L.divIcon({
    className: "",
    html: `<span class="port-marker-badge" style="--badge-color:${color};display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:8px;background:${color};border:2px solid white">
      <svg viewBox="0 0 24 24" width="${size * 0.62}" height="${size * 0.62}" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="1" y="7" width="13" height="9"></rect>
        <path d="M14 10h4l3 3v3h-7z"></path>
        <circle cx="6" cy="18" r="1.6"></circle>
        <circle cx="17.5" cy="18" r="1.6"></circle>
      </svg>
    </span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// Free-text search box (top-left overlay) for finding a port/depot by name
// or code. Purely a controlled input + match-count readout — the actual
// filtering/highlighting logic lives in the parent (LeafletMap), since it
// needs access to the marker refs and map instance.
function MapSearchBox({
  value,
  onChange,
  matchCount,
}: {
  value: string;
  onChange: (value: string) => void;
  matchCount: number;
}) {
  return (
    <div className="absolute left-3 top-3 z-[1000] w-56 rounded-lg border border-nb-ink/10 bg-white/95 p-2 shadow-md backdrop-blur-sm">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search ports/depots…"
        className="w-full rounded border border-nb-ink/20 px-2 py-1 text-xs font-medium text-nb-ink outline-none focus:border-nb-ink/40"
      />
      {value.trim() !== "" && (
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-nb-ink/50">
          {matchCount} match{matchCount === 1 ? "" : "es"}
        </p>
      )}
    </div>
  );
}

// Small always-visible key explaining what the marker colors/shapes mean.
// Rendered as a plain overlay positioned over the map (not a Leaflet
// control) since it's static, non-interactive content unrelated to the
// map's own pan/zoom state.
function MapLegend({
  tenants,
  showUnassignedPort,
  showUnassignedDepot,
  hoveredTenant,
  onHoverTenant,
  hoveredFeatureFlag,
  onHoverFeatureFlag,
}: {
  tenants: string[];
  showUnassignedPort: boolean;
  showUnassignedDepot: boolean;
  hoveredTenant: string | null;
  onHoverTenant: (tenant: string | null) => void;
  hoveredFeatureFlag: string | null;
  onHoverFeatureFlag: (flag: string | null) => void;
}) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-[1000] w-52 rounded-lg border border-nb-ink/10 bg-white/95 p-3 text-xs text-nb-ink shadow-md backdrop-blur-sm">
      <p className="mb-2 font-semibold uppercase tracking-wide text-nb-ink/60">Tenants</p>
      <ul className="mb-3 flex flex-col gap-1.5">
        {tenants.map((tenant) => (
          <li
            key={tenant}
            onMouseEnter={() => onHoverTenant(tenant)}
            onMouseLeave={() => onHoverTenant(null)}
            className={`flex cursor-default items-center gap-2 rounded pointer-events-auto px-1 -mx-1 py-0.5 transition-colors ${
              hoveredTenant === tenant ? "bg-nb-ink/10" : ""
            }`}
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-white shadow-sm"
              style={{ background: colorForTenant(tenant, DEFAULT_PORT_COLOR) }}
            />
            {labelForTenant(tenant)}
          </li>
        ))}
        {(showUnassignedPort || showUnassignedDepot) && (
          <li className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-white shadow-sm"
              style={{ background: DEFAULT_PORT_COLOR }}
            />
            Unassigned
          </li>
        )}
      </ul>
      <p className="mb-2 font-semibold uppercase tracking-wide text-nb-ink/60">Feature flags</p>
      <ul className="mb-3 flex flex-col gap-1.5">
        {KNOWN_FEATURE_FLAG_NAMES.map((flag) => (
          <li
            key={flag}
            onMouseEnter={() => onHoverFeatureFlag(flag)}
            onMouseLeave={() => onHoverFeatureFlag(null)}
            className={`flex cursor-default items-center gap-2 rounded pointer-events-auto px-1 -mx-1 py-0.5 transition-colors ${
              hoveredFeatureFlag === flag ? "bg-nb-ink/10" : ""
            }`}
          >
            <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border border-nb-ink/30 bg-nb-ink/5 text-[8px] font-bold uppercase text-nb-ink/60">
              ⚑
            </span>
            {flag}
          </li>
        ))}
      </ul>
      <p className="mb-2 font-semibold uppercase tracking-wide text-nb-ink/60">Legend</p>
      <ul className="flex flex-col gap-1.5">
        <li className="flex items-center gap-2">
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white"
            style={{ background: DEFAULT_PORT_COLOR }}
          >
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="2"></circle>
              <line x1="12" y1="7" x2="12" y2="21"></line>
              <path d="M5 12 a7 7 0 0 0 14 0"></path>
            </svg>
          </span>
          Port
        </li>
        <li className="flex items-center gap-2">
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-white"
            style={{ background: DEFAULT_DEPOT_COLOR }}
          >
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="7" width="13" height="9"></rect>
              <path d="M14 10h4l3 3v3h-7z"></path>
            </svg>
          </span>
          Depot
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-4 shrink-0 border-t-2 border-dashed" style={{ borderColor: DEFAULT_ROUTE_COLOR }} />
          Sea route
        </li>
      </ul>
    </div>
  );
}

// Small form rendered inside a marker popup for editing a port/depot's name,
// country and description in-place, plus a delete button. Only shown while
// edit mode is on; view mode shows plain read-only text instead.
function EditForm({
  name,
  code,
  tenant,
  country,
  description,
  featureFlagNames,
  onSave,
  onDelete,
}: {
  name: string;
  code?: string;
  tenant?: string;
  country: string;
  description: string;
  // Only passed in for item types that support feature flags (currently just
  // ports) — `undefined` hides the whole checkbox group instead of showing
  // one with nothing checked.
  featureFlagNames?: string[];
  onSave: (updates: {
    name: string;
    code?: string;
    tenant?: string;
    country: string;
    description: string;
    featureFlagNames?: string[];
  }) => void;
  onDelete: () => void;
}) {
  const [nameValue, setNameValue] = useState(name);
  const [codeValue, setCodeValue] = useState(code ?? "");
  const [tenantValue, setTenantValue] = useState(tenant ?? "");
  const [selectedFlags, setSelectedFlags] = useState<string[]>(featureFlagNames ?? []);

  return (
    <div className="flex w-56 flex-col gap-1.5">
      <input
        value={nameValue}
        onChange={(e) => setNameValue(e.target.value)}
        placeholder="Name"
        className="rounded border border-nb-ink/20 px-1.5 py-1 text-xs font-semibold"
      />
      {code !== undefined && (
        <input
          value={codeValue}
          onChange={(e) => setCodeValue(e.target.value.toUpperCase())}
          placeholder="Code (e.g. BELF)"
          className="rounded border border-nb-ink/20 px-1.5 py-1 text-xs font-semibold uppercase"
        />
      )}
      {tenant !== undefined && (
        <input
          value={tenantValue}
          onChange={(e) => setTenantValue(e.target.value)}
          placeholder="Tenant (e.g. Stena Line)"
          className="rounded border border-nb-ink/20 px-1.5 py-1 text-xs"
        />
      )}
      {featureFlagNames !== undefined && (
        <div className="flex flex-col gap-0.5 rounded border border-nb-ink/20 px-1.5 py-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-nb-ink/50">
            Feature flags
          </span>
          {KNOWN_FEATURE_FLAG_NAMES.map((flagName) => (
            <label key={flagName} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={selectedFlags.includes(flagName)}
                onChange={(e) =>
                  setSelectedFlags((prev) =>
                    e.target.checked ? [...prev, flagName] : prev.filter((f) => f !== flagName),
                  )
                }
              />
              {flagName}
            </label>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <button
          type="button"
          onClick={onDelete}
          className="rounded px-1.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() =>
            onSave({
              name: nameValue,
              ...(code !== undefined ? { code: codeValue } : {}),
              ...(tenant !== undefined ? { tenant: tenantValue } : {}),
              country,
              description,
              ...(featureFlagNames !== undefined ? { featureFlagNames: selectedFlags } : {}),
            })
          }
          className="nb-btn nb-btn-orange px-2 py-1 text-xs font-semibold"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// Form rendered inside a route's popup. A route is always anchored to two
// ports, so instead of freely editable coordinates it offers a dropdown of
// every existing port for each end — reassigning either end just points the
// route at a different port instead of detaching it into free space.
function RouteEditForm({
  name,
  description,
  startPortId,
  endPortId,
  ports,
  onSave,
  onDelete,
}: {
  name: string;
  description: string;
  startPortId: string;
  endPortId: string;
  ports: MapPortRecord[];
  onSave: (updates: { name: string; description: string; startPortId: string; endPortId: string }) => void;
  onDelete: () => void;
}) {
  const [startPortValue, setStartPortValue] = useState(startPortId);
  const [endPortValue, setEndPortValue] = useState(endPortId);

  return (
    <div className="flex w-60 flex-col gap-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-nb-ink/50">
        Start port
        <select
          value={startPortValue}
          onChange={(e) => setStartPortValue(e.target.value)}
          className="mt-0.5 w-full rounded border border-nb-ink/20 px-1.5 py-1 text-xs font-normal normal-case"
        >
          {ports.map((port) => (
            <option key={port.id} value={port.id}>
              {port.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[10px] font-semibold uppercase tracking-wide text-nb-ink/50">
        End port
        <select
          value={endPortValue}
          onChange={(e) => setEndPortValue(e.target.value)}
          className="mt-0.5 w-full rounded border border-nb-ink/20 px-1.5 py-1 text-xs font-normal normal-case"
        >
          {ports.map((port) => (
            <option key={port.id} value={port.id}>
              {port.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <button
          type="button"
          onClick={onDelete}
          className="rounded px-1.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() =>
            onSave({
              name,
              description,
              startPortId: startPortValue,
              endPortId: endPortValue,
            })
          }
          className="nb-btn nb-btn-orange px-2 py-1 text-xs font-semibold"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// Captures map clicks so a newly-armed "add port"/"add depot" mode can place
// the new marker wherever the user clicks, rather than at a fixed spot.
function ClickToAdd({ active, onClick }: { active: boolean; onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (active) onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// When a search matches one or more ports/depots, pans/zooms the map to
// keep every match in view (a no-op component purely for its useMap side
// effect — it renders nothing itself).
function FitBoundsToMatches({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.flyTo(points[0], Math.min(Math.max(map.getZoom(), 6), 7), { duration: 0.5 });
    } else {
      map.flyToBounds(L.latLngBounds(points), { padding: [64, 64], maxZoom: 7, duration: 0.5 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

interface LeafletMapProps {
  ports: MapPortRecord[];
  depots: MapDepotRecord[];
  routes: MapRouteRecord[];
  editMode: boolean;
  pendingAdd: "port" | "depot" | null;
  onMapClick: (lat: number, lng: number) => void;
  onPortDragEnd: (id: string, lat: number, lng: number) => void;
  onDepotDragEnd: (id: string, lat: number, lng: number) => void;
  onRouteControlDragEnd: (id: string, field: "control1" | "control2", lat: number, lng: number) => void;
  onPortSave: (
    id: string,
    updates: {
      name: string;
      code?: string;
      tenant?: string;
      country: string;
      description: string;
      featureFlagNames?: string[];
    },
  ) => void;
  onDepotSave: (
    id: string,
    updates: { name: string; code?: string; tenant?: string; country: string; description: string },
  ) => void;
  onRouteSave: (
    id: string,
    updates: { name: string; description: string; startPortId: string; endPortId: string },
  ) => void;
  onPortDelete: (id: string) => void;
  onDepotDelete: (id: string) => void;
  onRouteDelete: (id: string) => void;
}

export default function LeafletMap({
  ports,
  depots,
  routes,
  editMode,
  pendingAdd,
  onMapClick,
  onPortDragEnd,
  onDepotDragEnd,
  onRouteControlDragEnd,
  onPortSave,
  onDepotSave,
  onRouteSave,
  onPortDelete,
  onDepotDelete,
  onRouteDelete,
}: LeafletMapProps) {
  const controlIcon = useMemo(() => makeIcon("#7c3aed", 10, true), []);
  const portsById = useMemo(() => new Map(ports.map((p) => [p.id, p])), [ports]);
  // Lets a hovered route (Polyline) open the tooltip label of the two ports
  // it connects, even though the mouse itself is over the line rather than
  // either marker.
  const portMarkerRefs = useRef(new Map<string, L.Marker>());
  // Same idea as portMarkerRefs, but for depot markers — used by the
  // search highlight effect below to dim/pulse depot markers directly.
  const depotMarkerRefs = useRef(new Map<string, L.Marker>());
  // Lets the invisible wide hit-area line (below) reach into the visible
  // thin line and restyle it on hover, since they're two separate Polyline
  // instances.
  const routeLineRefs = useRef(new Map<string, L.Polyline>());
  // A soft, wide, low-opacity line drawn under the visible line, only
  // shown on hover — a "glow"/drop-shadow highlight in the route's own
  // color rather than swapping to a different highlight color.
  const routeGlowRefs = useRef(new Map<string, L.Polyline>());
  const routeStyleFor = (startPort: MapPortRecord, endPort: MapPortRecord) => ({
    color:
      startPort.tenant && startPort.tenant === endPort.tenant
        ? colorForTenant(startPort.tenant, DEFAULT_ROUTE_COLOR)
        : DEFAULT_ROUTE_COLOR,
    weight: 2,
    dashArray: "6 6",
  });
  // Toggles the same CSS class the port badge's own :hover rule uses, so
  // hovering the *route* also makes its two end ports look "active" even
  // though the cursor isn't actually over either marker.
  const setPortActive = (portId: string, active: boolean) => {
    const el = portMarkerRefs.current.get(portId)?.getElement();
    el?.querySelector(".port-marker-badge")?.classList.toggle("port-marker-badge--active", active);
  };

  // Search box (top-left overlay, rendered below): matches ports/depots by
  // name or code, case-insensitively. Matching markers pulse and stay at
  // full opacity; everything else fades out so matches stand out.
  const [searchQuery, setSearchQuery] = useState("");
  const query = searchQuery.trim().toLowerCase();
  const matchedPortIds = useMemo(() => {
    if (!query) return new Set<string>();
    return new Set(
      ports.filter((p) => p.name.toLowerCase().includes(query) || p.code?.toLowerCase().includes(query)).map((p) => p.id),
    );
  }, [ports, query]);
  const matchedDepotIds = useMemo(() => {
    if (!query) return new Set<string>();
    return new Set(
      depots
        .filter((d) => d.name.toLowerCase().includes(query) || d.code?.toLowerCase().includes(query))
        .map((d) => d.id),
    );
  }, [depots, query]);
  const matchCount = matchedPortIds.size + matchedDepotIds.size;
  const matchedPoints = useMemo<Array<[number, number]>>(() => {
    const pts: Array<[number, number]> = [];
    for (const port of ports) if (matchedPortIds.has(port.id)) pts.push([port.lat, port.lng]);
    for (const depot of depots) if (matchedDepotIds.has(depot.id)) pts.push([depot.lat, depot.lng]);
    return pts;
  }, [ports, depots, matchedPortIds, matchedDepotIds]);

  // Hovering a tenant in the legend (see MapLegend below) highlights all of
  // that tenant's ports/depots the same way a search match does — but
  // without panning the map (a mouse hover shouldn't yank the camera
  // around), so it's kept separate from matchedPoints/FitBoundsToMatches.
  const [hoveredTenant, setHoveredTenant] = useState<string | null>(null);
  const hoverPortIds = useMemo(() => {
    if (!hoveredTenant) return new Set<string>();
    return new Set(ports.filter((p) => p.tenant?.toLowerCase() === hoveredTenant).map((p) => p.id));
  }, [ports, hoveredTenant]);
  const hoverDepotIds = useMemo(() => {
    if (!hoveredTenant) return new Set<string>();
    return new Set(depots.filter((d) => d.tenant?.toLowerCase() === hoveredTenant).map((d) => d.id));
  }, [depots, hoveredTenant]);

  // Hovering a feature flag in the legend highlights every port carrying
  // that flag, the same way a tenant hover does. Depots don't currently
  // support feature flags at all, so a flag hover has no depot matches —
  // meaning every depot fades out along with non-matching ports, same as
  // "no match" behaves for a search/tenant filter.
  const [hoveredFeatureFlag, setHoveredFeatureFlag] = useState<string | null>(null);
  const hoverFlagPortIds = useMemo(() => {
    if (!hoveredFeatureFlag) return new Set<string>();
    return new Set(
      ports.filter((p) => p.featureFlags?.some((f) => f.name === hoveredFeatureFlag)).map((p) => p.id),
    );
  }, [ports, hoveredFeatureFlag]);

  // Search takes priority over a tenant hover if both are somehow active;
  // `null` means "no filter active" (full opacity, no pulse) rather than
  // "filter active but nothing matches".
  const activePortIds = query
    ? matchedPortIds
    : hoveredTenant
      ? hoverPortIds
      : hoveredFeatureFlag
        ? hoverFlagPortIds
        : null;
  const activeDepotIds = query
    ? matchedDepotIds
    : hoveredTenant
      ? hoverDepotIds
      : hoveredFeatureFlag
        ? EMPTY_ID_SET
        : null;

  // Applies the fade/pulse styling directly to marker DOM elements (same
  // ref+querySelector approach as setPortActive above) rather than
  // recreating icons per marker, since highlight state changes far more
  // often than marker identity. A search match keeps non-matches faintly
  // visible (0.25 opacity) since the user may be scanning for one among
  // many; a tenant hover instead hides everything else outright (0
  // opacity) so only that tenant's markers remain, with a glow highlight
  // (the same class used for the port's own :hover state) instead of the
  // search's pulse animation.
  useEffect(() => {
    const nonMatchOpacity = query ? 0.25 : 0;
    const isHovering = hoveredTenant !== null || hoveredFeatureFlag !== null;
    for (const [id, marker] of portMarkerRefs.current) {
      const isMatch = activePortIds?.has(id) ?? true;
      marker.setOpacity(activePortIds ? (isMatch ? 1 : nonMatchOpacity) : 1);
      const badge = marker.getElement()?.querySelector(".port-marker-badge");
      badge?.classList.toggle("search-match-badge", query !== "" && isMatch);
      badge?.classList.toggle("port-marker-badge--active", isHovering && isMatch);
    }
    for (const [id, marker] of depotMarkerRefs.current) {
      const isMatch = activeDepotIds?.has(id) ?? true;
      marker.setOpacity(activeDepotIds ? (isMatch ? 1 : nonMatchOpacity) : 1);
      const badge = marker.getElement()?.querySelector(".port-marker-badge");
      badge?.classList.toggle("search-match-badge", query !== "" && isMatch);
      badge?.classList.toggle("port-marker-badge--active", isHovering && isMatch);
    }
    // A route only stays visible while at least one of its two end ports
    // is visible too — otherwise hovering a tenant/feature flag (or
    // searching) left every route on screen regardless of whether either
    // endpoint actually matched, which made the highlight misleading.
    for (const route of routes) {
      const endpointVisible =
        !activePortIds || activePortIds.has(route.startPortId) || activePortIds.has(route.endPortId);
      routeLineRefs.current.get(route.id)?.setStyle({ opacity: endpointVisible ? 1 : nonMatchOpacity });
    }
  }, [activePortIds, activeDepotIds, query, hoveredTenant, hoveredFeatureFlag, ports, depots, routes]);

  // Legend always lists every known tenant (not just ones currently used
  // on the map) so it doubles as a reference key, plus a generic
  // "Unassigned" swatch if any port/depot has no tenant set.
  const tenantsInUse = useMemo(() => {
    let hasUnassignedPort = false;
    let hasUnassignedDepot = false;
    for (const port of ports) {
      if (!port.tenant) hasUnassignedPort = true;
    }
    for (const depot of depots) {
      if (!depot.tenant) hasUnassignedDepot = true;
    }
    return { tenants: Object.keys(TENANT_COLORS).sort(), hasUnassignedPort, hasUnassignedDepot };
  }, [ports, depots]);

  return (
    <>
      <MapSearchBox value={searchQuery} onChange={setSearchQuery} matchCount={matchCount} />
      <MapLegend
        tenants={tenantsInUse.tenants}
        showUnassignedPort={tenantsInUse.hasUnassignedPort}
        showUnassignedDepot={tenantsInUse.hasUnassignedDepot}
        hoveredTenant={hoveredTenant}
        onHoverTenant={setHoveredTenant}
        hoveredFeatureFlag={hoveredFeatureFlag}
        onHoverFeatureFlag={setHoveredFeatureFlag}
      />
      <MapContainer
      center={[50, 8]}
      zoom={5}
      minZoom={2}
      className={`h-full w-full ${pendingAdd ? "cursor-crosshair" : ""} ${editMode ? "map-edit-mode" : ""}`}
      worldCopyJump
      zoomControl={false}
    >
      <ZoomControl position="bottomright" />
      <ClickToAdd active={pendingAdd !== null} onClick={onMapClick} />
      <FitBoundsToMatches points={matchedPoints} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {routes.map((route) => {
        // A route is always connected to two ports — if either has been
        // deleted the route is deleted with it (DB cascade), but guard here
        // too in case client state is briefly out of sync.
        const startPort = portsById.get(route.startPortId);
        const endPort = portsById.get(route.endPortId);
        if (!startPort || !endPort) return null;
        // A hidden route (per the legend/search filtering handled in the
        // effect above) shouldn't still react to hover — otherwise its
        // glow highlight could pop in even though the route itself is
        // faded out.
        const routeVisible =
          !activePortIds || activePortIds.has(route.startPortId) || activePortIds.has(route.endPortId);

        return (
          <Fragment key={route.id}>
            {/* Invisible, much wider line carries all interaction (hover +
                click) so the path is easy to hover/click without needing to
                land the cursor exactly on the thin visible line. */}
            <Polyline
              positions={routeToPath(route, startPort, endPort)}
              pathOptions={{ color: "#000000", weight: 24, opacity: 0 }}
              eventHandlers={{
                mouseover: () => {
                  if (!routeVisible) return;
                  portMarkerRefs.current.get(route.startPortId)?.openTooltip();
                  portMarkerRefs.current.get(route.endPortId)?.openTooltip();
                  setPortActive(route.startPortId, true);
                  setPortActive(route.endPortId, true);
                  routeLineRefs.current.get(route.id)?.setStyle({ weight: 3 });
                  routeGlowRefs.current.get(route.id)?.setStyle({ opacity: 0.45 });
                  routeGlowRefs.current.get(route.id)?.bringToFront();
                  routeLineRefs.current.get(route.id)?.bringToFront();
                },
                mouseout: () => {
                  portMarkerRefs.current.get(route.startPortId)?.closeTooltip();
                  portMarkerRefs.current.get(route.endPortId)?.closeTooltip();
                  setPortActive(route.startPortId, false);
                  setPortActive(route.endPortId, false);
                  routeLineRefs.current.get(route.id)?.setStyle({ weight: 2 });
                  routeGlowRefs.current.get(route.id)?.setStyle({ opacity: 0 });
                },
              }}
            >
              {editMode && (
                <Popup>
                  <RouteEditForm
                    name={route.name}
                    description={route.description}
                    startPortId={route.startPortId}
                    endPortId={route.endPortId}
                    ports={ports}
                    onSave={(updates) => onRouteSave(route.id, updates)}
                    onDelete={() => onRouteDelete(route.id)}
                  />
                </Popup>
              )}
            </Polyline>
            <Polyline
              ref={(l) => {
                if (l) routeGlowRefs.current.set(route.id, l);
                else routeGlowRefs.current.delete(route.id);
              }}
              positions={routeToPath(route, startPort, endPort)}
              pathOptions={{ color: routeStyleFor(startPort, endPort).color, weight: 12, opacity: 0 }}
              interactive={false}
            />
            <Polyline
              ref={(l) => {
                if (l) routeLineRefs.current.set(route.id, l);
                else routeLineRefs.current.delete(route.id);
              }}
              positions={routeToPath(route, startPort, endPort)}
              pathOptions={routeStyleFor(startPort, endPort)}
              interactive={false}
            />
            {editMode && (
              <>
                <Marker
                  position={[route.control1Lat, route.control1Lng]}
                  icon={controlIcon}
                  draggable
                  eventHandlers={{
                    dragend: (e) => {
                      const { lat, lng } = e.target.getLatLng();
                      onRouteControlDragEnd(route.id, "control1", lat, lng);
                    },
                  }}
                />
                <Marker
                  position={[route.control2Lat, route.control2Lng]}
                  icon={controlIcon}
                  draggable
                  eventHandlers={{
                    dragend: (e) => {
                      const { lat, lng } = e.target.getLatLng();
                      onRouteControlDragEnd(route.id, "control2", lat, lng);
                    },
                  }}
                />
              </>
            )}
          </Fragment>
        );
      })}

      {ports.map((port) => (
        <Marker
          key={port.id}
          position={[port.lat, port.lng]}
          icon={getPortIcon(colorForTenant(port.tenant, DEFAULT_PORT_COLOR))}
          draggable={editMode}
          ref={(m) => {
            if (m) portMarkerRefs.current.set(port.id, m);
            else portMarkerRefs.current.delete(port.id);
          }}
          eventHandlers={{
            dragend: (e) => {
              const { lat, lng } = e.target.getLatLng();
              onPortDragEnd(port.id, lat, lng);
            },
          }}
        >
          {/* Always mounted (rather than `{!editMode && ...}`) — toggling
              editMode used to unmount/remount this Tooltip, and Leaflet
              leaks a native focus listener on the marker's DOM element
              when a tooltip is unbound while the marker itself stays
              mounted. That stale listener later throws
              "this._tooltip is null" the next time the element gets
              focus. Visibility in edit mode is instead controlled by the
              .map-edit-mode class on the map container (see globals.css),
              which keeps the tooltip bound the whole time. */}
          <Tooltip
            className="map-label-popup"
            direction="bottom"
            offset={[0, 16]}
          >
            {port.name}
            {port.code ? ` ${port.code}` : ""}
          </Tooltip>
          {editMode && (
            <Popup offset={[0, -14]}>
              <EditForm
                name={port.name}
                code={port.code}
                tenant={port.tenant}
                country={port.country}
                description={port.description}
                featureFlagNames={port.featureFlags?.map((f) => f.name) ?? []}
                onSave={(updates) => onPortSave(port.id, updates)}
                onDelete={() => onPortDelete(port.id)}
              />
            </Popup>
          )}
        </Marker>
      ))}

      {depots.map((depot) => (
        <Marker
          key={depot.id}
          position={[depot.lat, depot.lng]}
          icon={getDepotIcon(colorForTenant(depot.tenant, DEFAULT_DEPOT_COLOR))}
          draggable={editMode}
          ref={(m) => {
            if (m) depotMarkerRefs.current.set(depot.id, m);
            else depotMarkerRefs.current.delete(depot.id);
          }}
          eventHandlers={{
            dragend: (e) => {
              const { lat, lng } = e.target.getLatLng();
              onDepotDragEnd(depot.id, lat, lng);
            },
          }}
        >
          {/* Always mounted — see the matching comment on the port marker's
              Tooltip above for why. */}
          <Tooltip
            className="map-label-popup"
            direction="bottom"
            offset={[0, 14]}
          >
            {depot.name}
            {depot.code ? ` ${depot.code}` : ""}
          </Tooltip>
          {editMode && (
            <Popup offset={[0, -13]}>
              <EditForm
                name={depot.name}
                code={depot.code}
                tenant={depot.tenant}
                country={depot.country}
                description={depot.description}
                onSave={(updates) => onDepotSave(depot.id, updates)}
                onDelete={() => onDepotDelete(depot.id)}
              />
            </Popup>
          )}
        </Marker>
      ))}
      </MapContainer>
    </>
  );
}
