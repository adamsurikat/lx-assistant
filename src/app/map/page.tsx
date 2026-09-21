"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import type { MapPortRecord, MapDepotRecord, MapRouteRecord } from "@/lib/mapTypes";

// Leaflet touches `window` on import, so the map must only ever render on
// the client. Loading it via next/dynamic with ssr disabled keeps it out of
// the server-rendered bundle for this page entirely.
const LeafletMap = dynamic(() => import("@/components/LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm font-medium text-nb-ink/50">
      Loading map…
    </div>
  ),
});

async function jsonOrThrow(res: Response) {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export default function MapPage() {
  const [ports, setPorts] = useState<MapPortRecord[]>([]);
  const [depots, setDepots] = useState<MapDepotRecord[]>([]);
  const [routes, setRoutes] = useState<MapRouteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<"port" | "depot" | null>(null);
  const [addRouteError, setAddRouteError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadMapData = useCallback(async () => {
    const [portsRes, depotsRes, routesRes] = await Promise.all([
      fetch("/api/map/ports").then(jsonOrThrow),
      fetch("/api/map/depots").then(jsonOrThrow),
      fetch("/api/map/routes").then(jsonOrThrow),
    ]);
    setPorts(portsRes.ports);
    setDepots(depotsRes.depots);
    setRoutes(routesRes.routes);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadMapData();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMapData]);

  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      if (pendingAdd === "port") {
        const { port } = await jsonOrThrow(
          await fetch("/api/map/ports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "New port", country: "", description: "", lat, lng }),
          }),
        );
        setPorts((prev) => [...prev, port]);
      } else if (pendingAdd === "depot") {
        const { depot } = await jsonOrThrow(
          await fetch("/api/map/depots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "New depot", country: "", description: "", lat, lng }),
          }),
        );
        setDepots((prev) => [...prev, depot]);
      }
      setPendingAdd(null);
    },
    [pendingAdd],
  );

  // A route is always anchored to two ports, so instead of creating one
  // outright with guessed endpoints, clicking "+ Route" opens a small
  // picker (below, in the JSX) to choose the start/end ports up front —
  // the route is only actually created once that form is confirmed.
  const [routePicker, setRoutePicker] = useState<{ startPortId: string; endPortId: string } | null>(
    null,
  );

  const handleOpenRoutePicker = useCallback(() => {
    if (ports.length < 2) {
      setAddRouteError("Add at least two ports before creating a route.");
      return;
    }
    setAddRouteError(null);
    setRoutePicker({ startPortId: ports[0].id, endPortId: ports[1].id });
  }, [ports]);

  const handleConfirmAddRoute = useCallback(async () => {
    if (!routePicker) return;
    const startPort = ports.find((p) => p.id === routePicker.startPortId);
    const endPort = ports.find((p) => p.id === routePicker.endPortId);
    if (!startPort || !endPort) return;
    const { route } = await jsonOrThrow(
      await fetch("/api/map/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New route",
          description: "",
          startPortId: startPort.id,
          endPortId: endPort.id,
          control1Lat: startPort.lat,
          control1Lng: startPort.lng,
          control2Lat: endPort.lat,
          control2Lng: endPort.lng,
        }),
      }),
    );
    setRoutes((prev) => [...prev, route]);
    setRoutePicker(null);
  }, [ports, routePicker]);

  const handlePortDragEnd = useCallback(async (id: string, lat: number, lng: number) => {
    setPorts((prev) => prev.map((p) => (p.id === id ? { ...p, lat, lng } : p)));
    await fetch(`/api/map/ports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
  }, []);

  const handleDepotDragEnd = useCallback(async (id: string, lat: number, lng: number) => {
    setDepots((prev) => prev.map((d) => (d.id === id ? { ...d, lat, lng } : d)));
    await fetch(`/api/map/depots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
  }, []);

  const handleRouteControlDragEnd = useCallback(
    async (id: string, field: "control1" | "control2", lat: number, lng: number) => {
      const latKey = `${field}Lat` as const;
      const lngKey = `${field}Lng` as const;
      setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, [latKey]: lat, [lngKey]: lng } : r)));
      await fetch(`/api/map/routes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [latKey]: lat, [lngKey]: lng }),
      });
    },
    [],
  );

  const handlePortSave = useCallback(
    async (
      id: string,
      updates: {
        name: string;
        code?: string;
        tenant?: string;
        country: string;
        description: string;
        featureFlagNames?: string[];
      },
    ) => {
      setPorts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
      const res = await fetch(`/api/map/ports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        // The optimistic update above can't know the DB-assigned ids for
        // any newly (re)created feature-flag rows, so once the real
        // response comes back, reconcile with the authoritative record.
        const { port } = await res.json();
        setPorts((prev) => prev.map((p) => (p.id === id ? port : p)));
      }
    },
    [],
  );

  const handleDepotSave = useCallback(
    async (id: string, updates: { name: string; code?: string; tenant?: string; country: string; description: string }) => {
      setDepots((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
      await fetch(`/api/map/depots/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    },
    [],
  );

  const handleRouteSave = useCallback(
    async (id: string, updates: { name: string; description: string; startPortId: string; endPortId: string }) => {
      setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
      await fetch(`/api/map/routes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    },
    [],
  );

  const handlePortDelete = useCallback(async (id: string) => {
    // Deleting a port cascades to any routes anchored to it (DB-level, since
    // a route can never be left unconnected from a port) — drop them from
    // local state too so the map doesn't briefly show a dangling route.
    setPorts((prev) => prev.filter((p) => p.id !== id));
    setRoutes((prev) => prev.filter((r) => r.startPortId !== id && r.endPortId !== id));
    await fetch(`/api/map/ports/${id}`, { method: "DELETE" });
  }, []);

  const handleDepotDelete = useCallback(async (id: string) => {
    setDepots((prev) => prev.filter((d) => d.id !== id));
    await fetch(`/api/map/depots/${id}`, { method: "DELETE" });
  }, []);

  const handleRouteDelete = useCallback(async (id: string) => {
    setRoutes((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/map/routes/${id}`, { method: "DELETE" });
  }, []);

  const handleImportFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset the input immediately so selecting the same file again still
      // fires a change event (e.g. after fixing and re-exporting it).
      e.target.value = "";
      if (!file) return;

      setImporting(true);
      setImportError(null);
      setImportStatus(null);
      try {
        const text = await file.text();
        let geojson: unknown;
        try {
          geojson = JSON.parse(text);
        } catch {
          throw new Error("That file isn't valid JSON.");
        }

        const res = await fetch("/api/map/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geojson),
        });
        const result = await res.json();
        if (!res.ok) {
          throw new Error(result?.error ?? `Import failed: ${res.status}`);
        }

        await loadMapData();
        setImportStatus(
          `Imported: ${result.portsCreated} ports, ${result.depotsCreated} depots, ` +
            `${result.routesCreated} routes created (${result.portsSkipped + result.depotsSkipped + result.routesSkipped} already existed).`,
        );
      } catch (err) {
        setImportError(err instanceof Error ? err.message : "Import failed.");
      } finally {
        setImporting(false);
      }
    },
    [loadMapData],
  );

  return (
    <div className="flex h-screen flex-col">
      <AppHeader active="map" />
      <div className="nb-panel-sm m-3 flex flex-1 flex-col overflow-hidden bg-nb-paper">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-nb-ink/10 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-nb-ink">Map</h2>
            <button
              type="button"
              onClick={() => {
                setEditMode((v) => !v);
                setPendingAdd(null);
                setAddRouteError(null);
                setImportError(null);
                setImportStatus(null);
              }}
              className={`nb-btn px-3 py-1.5 text-xs font-semibold ${editMode ? "nb-btn-orange" : ""}`}
            >
              {editMode ? "Done editing" : "Edit annotations"}
            </button>
            {editMode && (
              <>
                <button
                  type="button"
                  onClick={() => setPendingAdd(pendingAdd === "port" ? null : "port")}
                  className={`nb-btn px-3 py-1.5 text-xs font-semibold ${pendingAdd === "port" ? "nb-btn-orange" : ""}`}
                >
                  {pendingAdd === "port" ? "Click map to place port…" : "+ Port"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingAdd(pendingAdd === "depot" ? null : "depot")}
                  className={`nb-btn px-3 py-1.5 text-xs font-semibold ${pendingAdd === "depot" ? "nb-btn-orange" : ""}`}
                >
                  {pendingAdd === "depot" ? "Click map to place depot…" : "+ Depot"}
                </button>
                <button type="button" onClick={handleOpenRoutePicker} className="nb-btn px-3 py-1.5 text-xs font-semibold">
                  + Route
                </button>
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  disabled={importing}
                  className="nb-btn px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importing ? "Importing…" : "Import GeoJSON"}
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,.geojson,application/geo+json,application/json"
                  className="hidden"
                  onChange={handleImportFileChange}
                />
                {addRouteError && <span className="text-xs font-medium text-red-600">{addRouteError}</span>}
                {importError && <span className="text-xs font-medium text-red-600">{importError}</span>}
                {importStatus && <span className="text-xs font-medium text-green-700">{importStatus}</span>}
              </>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-nb-ink/70">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
              Ports ({ports.length})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-nb-orange" />
              Truck depots ({depots.length})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-nb-ink" />
              Sea routes ({routes.length})
            </span>
          </div>
        </div>
        <div className="relative flex-1">
          {!loading && (
            <LeafletMap
              ports={ports}
              depots={depots}
              routes={routes}
              editMode={editMode}
              pendingAdd={pendingAdd}
              onMapClick={handleMapClick}
              onPortDragEnd={handlePortDragEnd}
              onDepotDragEnd={handleDepotDragEnd}
              onRouteControlDragEnd={handleRouteControlDragEnd}
              onPortSave={handlePortSave}
              onDepotSave={handleDepotSave}
              onRouteSave={handleRouteSave}
              onPortDelete={handlePortDelete}
              onDepotDelete={handleDepotDelete}
              onRouteDelete={handleRouteDelete}
            />
          )}
          {routePicker && (
            <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-black/20">
              <div className="nb-panel-sm w-72 bg-white p-4">
                <h3 className="mb-3 text-sm font-bold text-nb-ink">New sea route</h3>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wide text-nb-ink/50">
                  Start port
                  <select
                    value={routePicker.startPortId}
                    onChange={(e) =>
                      setRoutePicker((prev) => (prev ? { ...prev, startPortId: e.target.value } : prev))
                    }
                    className="mt-0.5 w-full rounded border border-nb-ink/20 px-1.5 py-1 text-xs font-normal normal-case"
                  >
                    {ports.map((port) => (
                      <option key={port.id} value={port.id}>
                        {port.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mb-3 block text-[10px] font-semibold uppercase tracking-wide text-nb-ink/50">
                  End port
                  <select
                    value={routePicker.endPortId}
                    onChange={(e) =>
                      setRoutePicker((prev) => (prev ? { ...prev, endPortId: e.target.value } : prev))
                    }
                    className="mt-0.5 w-full rounded border border-nb-ink/20 px-1.5 py-1 text-xs font-normal normal-case"
                  >
                    {ports.map((port) => (
                      <option key={port.id} value={port.id}>
                        {port.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRoutePicker(null)}
                    className="rounded px-2 py-1 text-xs font-semibold text-nb-ink/60 hover:bg-nb-ink/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmAddRoute}
                    disabled={routePicker.startPortId === routePicker.endPortId}
                    className="nb-btn nb-btn-orange px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>
                {routePicker.startPortId === routePicker.endPortId && (
                  <p className="mt-2 text-xs font-medium text-red-600">Start and end port must differ.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
