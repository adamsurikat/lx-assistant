"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, Polyline, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapPortRecord, MapDepotRecord, MapRouteRecord } from "@/lib/mapTypes";
import { routeToPath, cubicBezier, KNOWN_FEATURE_FLAG_NAMES } from "@/lib/mapTypes";

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
// A port/depot marker only actually starts moving once dragged further
// than this many screen pixels from where the drag began — below that, it
// snaps straight back to its starting position. Guards against a plain
// click (which Leaflet can report as a tiny drag) accidentally nudging an
// item's stored position.
const DRAG_DEADZONE_PX = 6;
// Leaflet Marker instances keep a reference to the map they're bound to
// on a non-typed internal `_map` field — used here so a marker's own drag
// event handlers can convert lat/lng to screen pixels without needing a
// separate `useMap()` call (which isn't available in this component,
// since it's the one rendering <MapContainer> rather than a child of it).
function mapFromMarkerEvent(e: L.LeafletEvent): L.Map | undefined {
  return (e.target as L.Marker & { _map?: L.Map })._map;
}
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

// Bezier control-point ("handle") icon — a bright, high-contrast dot with a
// thick white ring and glow so it's unmistakably a draggable handle even
// against busy map tiles or overlapping route lines.
function makeControlIcon(size = 16) {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:#f97316;border:3px solid white;box-shadow:0 0 0 2px #f97316,0 0 8px 2px rgba(249,115,22,0.7)"></span>`,
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
// Floating panel used for editing a selected port/depot/route in edit mode.
// Deliberately *not* a Leaflet Popup anchored to the item on the map (which
// used to move with the map and could cover nearby markers) — it's docked
// near the bottom of the map viewport instead, so it stays put regardless
// of which item is selected or how the map is panned/zoomed. Uses the same
// `nb-panel` card treatment (and the same plain-✕ close button style) as
// the post-it board's trash panel, so it reads as part of the app's design
// instead of a boxed-in overlay with a floating X.
function MapEditPanel({
  title,
  onGoTo,
  children,
  onClose,
}: {
  title: string;
  onGoTo: () => void;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[1100] flex justify-center px-3">
      <div className="nb-panel pointer-events-auto w-full max-w-2xl bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-nb-ink/70">{title}</h2>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onGoTo} className="nb-btn px-2 py-1 text-xs font-semibold">
              Go to
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-lg font-bold leading-none text-nb-ink/50 hover:text-nb-ink"
            >
              ✕
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

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
  selectedTenants,
  onToggleTenant,
  hoveredFeatureFlag,
  onHoverFeatureFlag,
  selectedFeatureFlags,
  onToggleFeatureFlag,
  onClearFilters,
}: {
  tenants: string[];
  showUnassignedPort: boolean;
  showUnassignedDepot: boolean;
  hoveredTenant: string | null;
  onHoverTenant: (tenant: string | null) => void;
  // Tenants/flags "pinned" by clicking them (rather than just hovered) —
  // these stay active as a filter regardless of mouse position, and any
  // number of tenants/flags can be pinned at once (matches are unioned
  // together, not intersected).
  selectedTenants: Set<string>;
  onToggleTenant: (tenant: string) => void;
  hoveredFeatureFlag: string | null;
  onHoverFeatureFlag: (flag: string | null) => void;
  selectedFeatureFlags: Set<string>;
  onToggleFeatureFlag: (flag: string) => void;
  onClearFilters: () => void;
}) {
  const hasFilters = selectedTenants.size > 0 || selectedFeatureFlags.size > 0;
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-[1000] w-52 rounded-lg border border-nb-ink/10 bg-white/95 p-3 text-xs text-nb-ink shadow-md backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-semibold uppercase tracking-wide text-nb-ink/60">Tenants</p>
        {hasFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="pointer-events-auto text-[10px] font-semibold uppercase tracking-wide text-nb-orange hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <ul className="mb-3 flex flex-col gap-1.5">
        {tenants.map((tenant) => (
          <li
            key={tenant}
            onMouseEnter={() => onHoverTenant(tenant)}
            onMouseLeave={() => onHoverTenant(null)}
            onClick={() => onToggleTenant(tenant)}
            className={`flex cursor-pointer items-center gap-2 rounded pointer-events-auto px-1 -mx-1 py-0.5 transition-colors ${
              selectedTenants.has(tenant)
                ? "bg-nb-orange/15 font-semibold ring-1 ring-inset ring-nb-orange/50"
                : hoveredTenant === tenant
                  ? "bg-nb-ink/10"
                  : ""
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
            onClick={() => onToggleFeatureFlag(flag)}
            className={`flex cursor-pointer items-center gap-2 rounded pointer-events-auto px-1 -mx-1 py-0.5 transition-colors ${
              selectedFeatureFlags.has(flag)
                ? "bg-nb-orange/15 font-semibold ring-1 ring-inset ring-nb-orange/50"
                : hoveredFeatureFlag === flag
                  ? "bg-nb-ink/10"
                  : ""
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
  onDiscard,
  onAddRoute,
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
  // Only passed in for ports (routes always connect two ports, so this
  // doesn't make sense for depots) — starts the "click another port to
  // connect a route to this one" flow.
  onAddRoute?: () => void;
  // Reverts this item back to how it looked when edit mode was turned on
  // (position included) — items are always draggable while editing now, so
  // this is the way to undo an accidental move instead of a lock toggle.
  onDiscard: () => void;
  onDelete: () => void;
}) {
  const [nameValue, setNameValue] = useState(name);
  const [codeValue, setCodeValue] = useState(code ?? "");
  const [tenantValue, setTenantValue] = useState(tenant ?? "");
  const [selectedFlags, setSelectedFlags] = useState<string[]>(featureFlagNames ?? []);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-nb-ink/50">
              Name
            </span>
            <input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              placeholder="Name"
              className="min-w-0 flex-1 rounded border border-nb-ink/20 px-1.5 py-1 text-xs font-semibold"
            />
          </label>
          {code !== undefined && (
            <label className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-nb-ink/50">
                Code
              </span>
              <input
                value={codeValue}
                onChange={(e) => setCodeValue(e.target.value.toUpperCase())}
                placeholder="Code (e.g. BELF)"
                className="min-w-0 flex-1 rounded border border-nb-ink/20 px-1.5 py-1 text-xs font-semibold uppercase"
              />
            </label>
          )}
          {tenant !== undefined && (
            <label className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-nb-ink/50">
                Tenant
              </span>
              <input
                value={tenantValue}
                onChange={(e) => setTenantValue(e.target.value)}
                placeholder="Tenant (e.g. Stena Line)"
                className="min-w-0 flex-1 rounded border border-nb-ink/20 px-1.5 py-1 text-xs"
              />
            </label>
          )}
        </div>
        <div className="flex flex-col gap-3">
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
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="rounded px-1.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
          {onAddRoute && (
            <button
              type="button"
              onClick={onAddRoute}
              className="rounded px-1.5 py-1 text-xs font-semibold text-nb-ink/60 hover:bg-nb-ink/5"
            >
              Add route
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className="rounded px-1.5 py-1 text-xs font-semibold text-nb-ink/60 hover:bg-nb-ink/5"
          >
            Discard
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
            Done
          </button>
        </div>
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
  onDiscard,
  onDelete,
}: {
  name: string;
  description: string;
  startPortId: string;
  endPortId: string;
  ports: MapPortRecord[];
  onSave: (updates: { name: string; description: string; startPortId: string; endPortId: string }) => void;
  // Reverts this route's endpoints and bezier control points back to how
  // they looked when edit mode was turned on — the calibration handles are
  // always shown/draggable while editing now, so this is the way to undo
  // an accidental drag instead of a lock toggle.
  onDiscard: () => void;
  onDelete: () => void;
}) {
  const [startPortValue, setStartPortValue] = useState(startPortId);
  const [endPortValue, setEndPortValue] = useState(endPortId);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      </div>
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <button
          type="button"
          onClick={onDelete}
          className="rounded px-1.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className="rounded px-1.5 py-1 text-xs font-semibold text-nb-ink/60 hover:bg-nb-ink/5"
          >
            Discard
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
            Done
          </button>
        </div>
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

// One-shot "go to" request: fired by the "Go to" button in the edit panel so
// the map recenters on whatever's currently selected. A nonce is included
// (rather than keying purely off the points) so clicking "Go to" again on an
// already-centered item still re-triggers the flyTo/flash.
interface FocusRequest {
  points: Array<[number, number]>;
  nonce: number;
}

function FlyToFocus({ request }: { request: FocusRequest | null }) {
  const map = useMap();
  useEffect(() => {
    if (!request || request.points.length === 0) return;
    if (request.points.length === 1) {
      map.flyTo(request.points[0], 12, { duration: 0.5 });
    } else {
      map.flyToBounds(L.latLngBounds(request.points), { padding: [64, 64], maxZoom: 12, duration: 0.5 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);
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
  onPortDiscard: (id: string) => void;
  onDepotDiscard: (id: string) => void;
  onRouteDiscard: (id: string) => void;
  onCreateRoute: (startPortId: string, endPortId: string) => void;
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
  onPortDiscard,
  onDepotDiscard,
  onRouteDiscard,
  onCreateRoute,
}: LeafletMapProps) {
  const controlIcon = useMemo(() => makeControlIcon(16), []);
  const portsById = useMemo(() => new Map(ports.map((p) => [p.id, p])), [ports]);
  const depotsById = useMemo(() => new Map(depots.map((d) => [d.id, d])), [depots]);
  // Lets a hovered route (Polyline) open the tooltip label of the two ports
  // it connects, even though the mouse itself is over the line rather than
  // either marker.
  const portMarkerRefs = useRef(new Map<string, L.Marker>());
  // Same idea as portMarkerRefs, but for depot markers — used by the
  // search highlight effect below to dim/pulse depot markers directly.
  const depotMarkerRefs = useRef(new Map<string, L.Marker>());
  // Remembers each port/depot marker's position at the start of a drag, so
  // a very small accidental drag (e.g. the tiny mouse movement that can
  // happen on a plain click) can be detected and ignored instead of
  // nudging the item — see DRAG_DEADZONE_PX below.
  const portDragStartRefs = useRef(new Map<string, L.LatLng>());
  const depotDragStartRefs = useRef(new Map<string, L.LatLng>());
  // Lets the invisible wide hit-area line (below) reach into the visible
  // thin line and restyle it on hover, since they're two separate Polyline
  // instances.
  const routeLineRefs = useRef(new Map<string, L.Polyline>());
  // A soft, wide, low-opacity line drawn under the visible line, only
  // shown on hover — a "glow"/drop-shadow highlight in the route's own
  // color rather than swapping to a different highlight color.
  const routeGlowRefs = useRef(new Map<string, L.Polyline>());
  // Guide lines from each anchor port to its nearest bezier handle —
  // updated imperatively (not via React re-render) while a handle is being
  // dragged so the curve/guides track the cursor smoothly.
  const routeGuide1Refs = useRef(new Map<string, L.Polyline>());
  const routeGuide2Refs = useRef(new Map<string, L.Polyline>());
  // The item currently being edited. Rather than a Leaflet Popup anchored
  // to the marker/route itself (which used to cover nearby items and move
  // around with the map), clicking a port/depot/route in edit mode selects
  // it here and its edit form renders in a floating panel docked near the
  // bottom of the map (see the JSX below) instead.
  const [selectedItem, setSelectedItem] = useState<{ type: "port" | "depot" | "route"; id: string } | null>(null);
  const openItem = (type: "port" | "depot" | "route", id: string) => {
    setSelectedItem({ type, id });
  };
  const closeItem = () => {
    setSelectedItem(null);
  };
  // Set to a port's id while "Add route" (in that port's edit panel) is
  // waiting for the user to click a second port to connect it to — see
  // the port marker's click handler and the banner rendered near the
  // bottom of the map below.
  const [routeDraftPortId, setRouteDraftPortId] = useState<string | null>(null);
  // Leaving edit mode should close any open panel rather than leaving it
  // dangling on screen. Adjusting state during render in response to a
  // prop change (rather than in a useEffect) is the pattern React
  // recommends for this — see "Adjusting state when a prop changes" —
  // using a bit of state (not a ref) to remember the previous value,
  // since refs can't be read/written during render.
  const [prevEditMode, setPrevEditMode] = useState(editMode);
  if (prevEditMode !== editMode) {
    setPrevEditMode(editMode);
    if (!editMode && selectedItem) setSelectedItem(null);
    if (!editMode && routeDraftPortId) setRouteDraftPortId(null);
  }
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
  // Maps a port id to every route touching it, so hovering a port marker
  // can highlight all of its connected routes (the reverse of hovering a
  // route, which already highlights its two end ports via setPortActive).
  const routesByPort = useMemo(() => {
    const map = new Map<string, MapRouteRecord[]>();
    for (const route of routes) {
      map.set(route.startPortId, [...(map.get(route.startPortId) ?? []), route]);
      map.set(route.endPortId, [...(map.get(route.endPortId) ?? []), route]);
    }
    return map;
  }, [routes]);
  const setRouteHighlighted = (routeId: string, active: boolean) => {
    routeLineRefs.current.get(routeId)?.setStyle({ weight: active ? 3 : 2 });
    routeGlowRefs.current.get(routeId)?.setStyle({ opacity: active ? 0.6 : 0 });
    if (active) {
      routeGlowRefs.current.get(routeId)?.bringToFront();
      routeLineRefs.current.get(routeId)?.bringToFront();
    }
  };

  // Search box (top-left overlay, rendered below): matches ports/depots by
  // name or code, case-insensitively. Matching markers pulse and stay at
  // full opacity; everything else fades out so matches stand out.
  const [searchQuery, setSearchQuery] = useState("");
  const query = searchQuery.trim().toLowerCase();

  // "Go to" button in the edit panel: recenters the map on the currently
  // selected port/depot/route without changing the selection itself.
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const focusOnItem = (item: { type: "port" | "depot" | "route"; id: string }) => {
    let points: Array<[number, number]> = [];
    if (item.type === "port") {
      const port = portsById.get(item.id);
      if (port) points = [[port.lat, port.lng]];
    } else if (item.type === "depot") {
      const depot = depotsById.get(item.id);
      if (depot) points = [[depot.lat, depot.lng]];
    } else {
      const route = routes.find((r) => r.id === item.id);
      const startPort = route ? portsById.get(route.startPortId) : undefined;
      const endPort = route ? portsById.get(route.endPortId) : undefined;
      points = [startPort, endPort]
        .filter((p): p is MapPortRecord => !!p)
        .map((p) => [p.lat, p.lng]);
    }
    if (points.length === 0) return;
    setFocusRequest({ points, nonce: Date.now() });
  };
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
  // Clicking a tenant/flag instead "pins" it into these Sets so the filter
  // stays active regardless of mouse position, and any number of
  // tenants/flags can be pinned together — their matches are unioned, not
  // intersected, so e.g. pinning two tenants shows both at once.
  const [hoveredTenant, setHoveredTenant] = useState<string | null>(null);
  const [selectedTenants, setSelectedTenants] = useState<Set<string>>(new Set());
  const toggleTenant = (tenant: string) =>
    setSelectedTenants((prev) => {
      const next = new Set(prev);
      if (next.has(tenant)) next.delete(tenant);
      else next.add(tenant);
      return next;
    });
  const activeTenants = useMemo(() => {
    if (!hoveredTenant) return selectedTenants;
    const next = new Set(selectedTenants);
    next.add(hoveredTenant);
    return next;
  }, [selectedTenants, hoveredTenant]);
  const hoverPortIds = useMemo(() => {
    if (activeTenants.size === 0) return new Set<string>();
    return new Set(ports.filter((p) => p.tenant && activeTenants.has(p.tenant.toLowerCase())).map((p) => p.id));
  }, [ports, activeTenants]);
  const hoverDepotIds = useMemo(() => {
    if (activeTenants.size === 0) return new Set<string>();
    return new Set(depots.filter((d) => d.tenant && activeTenants.has(d.tenant.toLowerCase())).map((d) => d.id));
  }, [depots, activeTenants]);

  // Hovering a feature flag in the legend highlights every port carrying
  // that flag, the same way a tenant hover does. Depots don't currently
  // support feature flags at all, so a flag filter has no depot matches —
  // meaning every depot fades out along with non-matching ports, same as
  // "no match" behaves for a search/tenant filter.
  const [hoveredFeatureFlag, setHoveredFeatureFlag] = useState<string | null>(null);
  const [selectedFeatureFlags, setSelectedFeatureFlags] = useState<Set<string>>(new Set());
  const toggleFeatureFlag = (flag: string) =>
    setSelectedFeatureFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  const activeFeatureFlags = useMemo(() => {
    if (!hoveredFeatureFlag) return selectedFeatureFlags;
    const next = new Set(selectedFeatureFlags);
    next.add(hoveredFeatureFlag);
    return next;
  }, [selectedFeatureFlags, hoveredFeatureFlag]);
  const hoverFlagPortIds = useMemo(() => {
    if (activeFeatureFlags.size === 0) return new Set<string>();
    return new Set(
      ports.filter((p) => p.featureFlags?.some((f) => activeFeatureFlags.has(f.name))).map((p) => p.id),
    );
  }, [ports, activeFeatureFlags]);
  const clearLegendFilters = () => {
    setSelectedTenants(new Set());
    setSelectedFeatureFlags(new Set());
  };

  // Search takes priority over a tenant/feature-flag filter if both are
  // somehow active; `null` means "no filter active" (full opacity, no
  // pulse) rather than "filter active but nothing matches". A tenant and a
  // flag filter can be active together (e.g. one pinned, one hovered, or
  // both pinned) — their matches are unioned so either one showing a port
  // is enough to keep it visible.
  const hasLegendFilter = activeTenants.size > 0 || activeFeatureFlags.size > 0;
  const activePortIds = useMemo(() => {
    if (query) return matchedPortIds;
    if (hasLegendFilter) return new Set([...hoverPortIds, ...hoverFlagPortIds]);
    return null;
  }, [query, matchedPortIds, hasLegendFilter, hoverPortIds, hoverFlagPortIds]);
  const activeDepotIds = query ? matchedDepotIds : hasLegendFilter ? hoverDepotIds : null;

  // When hovering a tenant/feature flag, a route between a matching port
  // and a *non-matching* one (e.g. a P&O Ferries port connected to a Stena
  // Line port) still gets highlighted (see the endpointVisible/highlight
  // logic below) — but without this, the far-end port itself would still
  // fade out to 0 opacity, making the route look like it goes nowhere.
  // This expands activePortIds with every port directly connected (via a
  // route) to an already-matching port, so that far end stays visible too.
  const connectedPortIds = useMemo(() => {
    if (!activePortIds) return null;
    const result = new Set(activePortIds);
    for (const route of routes) {
      if (activePortIds.has(route.startPortId)) result.add(route.endPortId);
      if (activePortIds.has(route.endPortId)) result.add(route.startPortId);
    }
    return result;
  }, [activePortIds, routes]);

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
    const isHovering = hasLegendFilter;
    for (const [id, marker] of portMarkerRefs.current) {
      const isMatch = activePortIds?.has(id) ?? true;
      const isVisible = isMatch || (isHovering && (connectedPortIds?.has(id) ?? false));
      marker.setOpacity(activePortIds ? (isVisible ? 1 : nonMatchOpacity) : 1);
      const badge = marker.getElement()?.querySelector(".port-marker-badge");
      badge?.classList.toggle("search-match-badge", query !== "" && isMatch);
      badge?.classList.toggle("port-marker-badge--active", isHovering && isMatch);
      badge?.classList.toggle("port-marker-badge--selected", selectedItem?.type === "port" && selectedItem.id === id);
    }
    for (const [id, marker] of depotMarkerRefs.current) {
      const isMatch = activeDepotIds?.has(id) ?? true;
      marker.setOpacity(activeDepotIds ? (isMatch ? 1 : nonMatchOpacity) : 1);
      const badge = marker.getElement()?.querySelector(".port-marker-badge");
      badge?.classList.toggle("search-match-badge", query !== "" && isMatch);
      badge?.classList.toggle("port-marker-badge--active", isHovering && isMatch);
      badge?.classList.toggle("port-marker-badge--selected", selectedItem?.type === "depot" && selectedItem.id === id);
    }
    // A route only stays visible while at least one of its two end ports
    // is visible too — otherwise hovering a tenant/feature flag (or
    // searching) left every route on screen regardless of whether either
    // endpoint actually matched, which made the highlight misleading.
    // Matching routes during a tenant/feature-flag hover (not a search)
    // also get the same glow + thicker-line + front-of-stack treatment as
    // a directly-hovered route, rather than just staying at their normal
    // thin/default styling — a plain 2px dashed line was easy to overlook
    // against the map tiles, which made it look like connected routes
    // weren't showing up at all even though they technically were.
    for (const route of routes) {
      const endpointVisible =
        !activePortIds || activePortIds.has(route.startPortId) || activePortIds.has(route.endPortId);
      const highlight = isHovering && endpointVisible;
      const line = routeLineRefs.current.get(route.id);
      const glow = routeGlowRefs.current.get(route.id);
      line?.setStyle({ opacity: endpointVisible ? 1 : nonMatchOpacity, weight: highlight ? 3 : 2 });
      glow?.setStyle({ opacity: highlight ? 0.6 : 0 });
      if (highlight) {
        glow?.bringToFront();
        line?.bringToFront();
      }
    }
  }, [
    activePortIds,
    activeDepotIds,
    connectedPortIds,
    query,
    hasLegendFilter,
    ports,
    depots,
    routes,
    selectedItem,
  ]);

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
        selectedTenants={selectedTenants}
        onToggleTenant={toggleTenant}
        hoveredFeatureFlag={hoveredFeatureFlag}
        onHoverFeatureFlag={setHoveredFeatureFlag}
        selectedFeatureFlags={selectedFeatureFlags}
        onToggleFeatureFlag={toggleFeatureFlag}
        onClearFilters={clearLegendFilters}
      />
      <MapContainer
      center={[50, 8]}
      zoom={5}
      minZoom={2}
      className={`h-full w-full ${pendingAdd || routeDraftPortId ? "cursor-crosshair" : ""}`}
      worldCopyJump
      zoomControl={false}
    >
      <ZoomControl position="bottomright" />
      <ClickToAdd active={pendingAdd !== null} onClick={onMapClick} />
      <ClickToAdd active={routeDraftPortId !== null} onClick={() => setRouteDraftPortId(null)} />
      <FitBoundsToMatches points={matchedPoints} />
      <FlyToFocus request={focusRequest} />
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
                  setRouteHighlighted(route.id, true);
                },
                mouseout: () => {
                  portMarkerRefs.current.get(route.startPortId)?.closeTooltip();
                  portMarkerRefs.current.get(route.endPortId)?.closeTooltip();
                  setPortActive(route.startPortId, false);
                  setPortActive(route.endPortId, false);
                  setRouteHighlighted(route.id, false);
                },
                click: () => {
                  if (editMode) openItem("route", route.id);
                },
              }}
            />
            <Polyline
              ref={(l) => {
                if (l) routeGlowRefs.current.set(route.id, l);
                else routeGlowRefs.current.delete(route.id);
              }}
              positions={routeToPath(route, startPort, endPort)}
              // Always a fixed white highlight color (not the route's own
              // tenant color) — a cross-tenant route falls back to near-black
              // (DEFAULT_ROUTE_COLOR), so a same-colored "glow" behind it was
              // essentially invisible against the map. This guarantees the
              // highlight stands out regardless of the route's own color.
              pathOptions={{ color: "#ffffff", weight: 14, opacity: 0 }}
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
            {editMode && selectedItem?.type === "route" && selectedItem.id === route.id && (
              <>
                {/* Dashed guide lines from each anchor port to its nearest
                    handle make the bezier's shape easier to reason about —
                    control1 pulls the curve away from the start port,
                    control2 from the end port. */}
                <Polyline
                  ref={(l) => {
                    if (l) routeGuide1Refs.current.set(route.id, l);
                    else routeGuide1Refs.current.delete(route.id);
                  }}
                  positions={[
                    [startPort.lat, startPort.lng],
                    [route.control1Lat, route.control1Lng],
                  ]}
                  pathOptions={{ color: "#f97316", weight: 1.5, dashArray: "4 4", opacity: 0.85 }}
                  interactive={false}
                />
                <Polyline
                  ref={(l) => {
                    if (l) routeGuide2Refs.current.set(route.id, l);
                    else routeGuide2Refs.current.delete(route.id);
                  }}
                  positions={[
                    [endPort.lat, endPort.lng],
                    [route.control2Lat, route.control2Lng],
                  ]}
                  pathOptions={{ color: "#f97316", weight: 1.5, dashArray: "4 4", opacity: 0.85 }}
                  interactive={false}
                />
                <Marker
                  position={[route.control1Lat, route.control1Lng]}
                  icon={controlIcon}
                  draggable
                  zIndexOffset={1000}
                  eventHandlers={{
                    drag: (e) => {
                      const { lat, lng } = e.target.getLatLng();
                      const path = cubicBezier(
                        [startPort.lat, startPort.lng],
                        [endPort.lat, endPort.lng],
                        [lat, lng],
                        [route.control2Lat, route.control2Lng],
                      );
                      routeLineRefs.current.get(route.id)?.setLatLngs(path);
                      routeGlowRefs.current.get(route.id)?.setLatLngs(path);
                      routeGuide1Refs.current.get(route.id)?.setLatLngs([
                        [startPort.lat, startPort.lng],
                        [lat, lng],
                      ]);
                    },
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
                  zIndexOffset={1000}
                  eventHandlers={{
                    drag: (e) => {
                      const { lat, lng } = e.target.getLatLng();
                      const path = cubicBezier(
                        [startPort.lat, startPort.lng],
                        [endPort.lat, endPort.lng],
                        [route.control1Lat, route.control1Lng],
                        [lat, lng],
                      );
                      routeLineRefs.current.get(route.id)?.setLatLngs(path);
                      routeGlowRefs.current.get(route.id)?.setLatLngs(path);
                      routeGuide2Refs.current.get(route.id)?.setLatLngs([
                        [endPort.lat, endPort.lng],
                        [lat, lng],
                      ]);
                    },
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
            dragstart: (e) => {
              portDragStartRefs.current.set(port.id, e.target.getLatLng());
            },
            drag: (e) => {
              const start = portDragStartRefs.current.get(port.id);
              const map = mapFromMarkerEvent(e);
              if (!start || !map) return;
              const current = e.target.getLatLng();
              const deltaPx = map.latLngToContainerPoint(start).distanceTo(map.latLngToContainerPoint(current));
              if (deltaPx < DRAG_DEADZONE_PX) e.target.setLatLng(start);
            },
            dragend: (e) => {
              const start = portDragStartRefs.current.get(port.id);
              portDragStartRefs.current.delete(port.id);
              const map = mapFromMarkerEvent(e);
              const current = e.target.getLatLng();
              if (start && map) {
                const deltaPx = map.latLngToContainerPoint(start).distanceTo(map.latLngToContainerPoint(current));
                if (deltaPx < DRAG_DEADZONE_PX) {
                  e.target.setLatLng(start);
                  return;
                }
              }
              onPortDragEnd(port.id, current.lat, current.lng);
            },
            click: () => {
              if (routeDraftPortId) {
                if (routeDraftPortId !== port.id) onCreateRoute(routeDraftPortId, port.id);
                setRouteDraftPortId(null);
                return;
              }
              if (editMode) openItem("port", port.id);
            },
            mouseover: () => {
              for (const route of routesByPort.get(port.id) ?? []) {
                const otherPortId = route.startPortId === port.id ? route.endPortId : route.startPortId;
                portMarkerRefs.current.get(otherPortId)?.openTooltip();
                setPortActive(otherPortId, true);
                setRouteHighlighted(route.id, true);
              }
            },
            mouseout: () => {
              for (const route of routesByPort.get(port.id) ?? []) {
                const otherPortId = route.startPortId === port.id ? route.endPortId : route.startPortId;
                portMarkerRefs.current.get(otherPortId)?.closeTooltip();
                setPortActive(otherPortId, false);
                setRouteHighlighted(route.id, false);
              }
            },
          }}
        >
          {/* Always mounted (rather than `{!editMode && ...}`) — toggling
              editMode used to unmount/remount this Tooltip, and Leaflet
              leaks a native focus listener on the marker's DOM element
              when a tooltip is unbound while the marker itself stays
              mounted. That stale listener later throws
              "this._tooltip is null" the next time the element gets
              focus. It now just uses Leaflet's normal hover-triggered
              tooltip behavior in both view and edit mode. */}
          <Tooltip
            className="map-label-popup"
            direction="bottom"
            offset={[0, 16]}
          >
            {port.name}
            {port.code ? ` ${port.code}` : ""}
          </Tooltip>
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
            dragstart: (e) => {
              depotDragStartRefs.current.set(depot.id, e.target.getLatLng());
            },
            drag: (e) => {
              const start = depotDragStartRefs.current.get(depot.id);
              const map = mapFromMarkerEvent(e);
              if (!start || !map) return;
              const current = e.target.getLatLng();
              const deltaPx = map.latLngToContainerPoint(start).distanceTo(map.latLngToContainerPoint(current));
              if (deltaPx < DRAG_DEADZONE_PX) e.target.setLatLng(start);
            },
            dragend: (e) => {
              const start = depotDragStartRefs.current.get(depot.id);
              depotDragStartRefs.current.delete(depot.id);
              const map = mapFromMarkerEvent(e);
              const current = e.target.getLatLng();
              if (start && map) {
                const deltaPx = map.latLngToContainerPoint(start).distanceTo(map.latLngToContainerPoint(current));
                if (deltaPx < DRAG_DEADZONE_PX) {
                  e.target.setLatLng(start);
                  return;
                }
              }
              onDepotDragEnd(depot.id, current.lat, current.lng);
            },
            click: () => {
              if (editMode) openItem("depot", depot.id);
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
        </Marker>
      ))}
      </MapContainer>
      {editMode && selectedItem && (
        <MapEditPanel
          title={selectedItem.type === "port" ? "Edit port" : selectedItem.type === "depot" ? "Edit depot" : "Edit route"}
          onGoTo={() => focusOnItem(selectedItem)}
          onClose={closeItem}
        >
          {selectedItem.type === "port" &&
            (() => {
              const port = portsById.get(selectedItem.id);
              if (!port) return null;
              return (
                <EditForm
                  key={port.id}
                  name={port.name}
                  code={port.code}
                  tenant={port.tenant}
                  country={port.country}
                  description={port.description}
                  featureFlagNames={port.featureFlags?.map((f) => f.name) ?? []}
                  onSave={(updates) => {
                    onPortSave(port.id, updates);
                    closeItem();
                  }}
                  onDiscard={() => {
                    onPortDiscard(port.id);
                    closeItem();
                  }}
                  onAddRoute={() => {
                    setRouteDraftPortId(port.id);
                    closeItem();
                  }}
                  onDelete={() => {
                    onPortDelete(port.id);
                    closeItem();
                  }}
                />
              );
            })()}
          {selectedItem.type === "depot" &&
            (() => {
              const depot = depotsById.get(selectedItem.id);
              if (!depot) return null;
              return (
                <EditForm
                  key={depot.id}
                  name={depot.name}
                  code={depot.code}
                  tenant={depot.tenant}
                  country={depot.country}
                  description={depot.description}
                  onSave={(updates) => {
                    onDepotSave(depot.id, updates);
                    closeItem();
                  }}
                  onDiscard={() => {
                    onDepotDiscard(depot.id);
                    closeItem();
                  }}
                  onDelete={() => {
                    onDepotDelete(depot.id);
                    closeItem();
                  }}
                />
              );
            })()}
          {selectedItem.type === "route" &&
            (() => {
              const route = routes.find((r) => r.id === selectedItem.id);
              if (!route) return null;
              return (
                <RouteEditForm
                  key={route.id}
                  name={route.name}
                  description={route.description}
                  startPortId={route.startPortId}
                  endPortId={route.endPortId}
                  ports={ports}
                  onSave={(updates) => {
                    onRouteSave(route.id, updates);
                    closeItem();
                  }}
                  onDiscard={() => {
                    onRouteDiscard(route.id);
                    closeItem();
                  }}
                  onDelete={() => {
                    onRouteDelete(route.id);
                    closeItem();
                  }}
                />
              );
            })()}
        </MapEditPanel>
      )}
      {routeDraftPortId && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[1100] flex justify-center px-3">
          <div className="nb-panel pointer-events-auto flex items-center gap-3 bg-white px-4 py-2">
            <p className="text-xs font-semibold text-nb-ink">
              Click another port to connect a route to {portsById.get(routeDraftPortId)?.name ?? "this port"}…
            </p>
            <button
              type="button"
              onClick={() => setRouteDraftPortId(null)}
              className="rounded px-1.5 py-1 text-xs font-semibold text-nb-ink/60 hover:bg-nb-ink/5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

