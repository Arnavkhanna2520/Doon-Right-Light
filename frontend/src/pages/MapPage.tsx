import { useEffect, useState } from "react";
import { Filters } from "../components/Filters";
import MapView, { type PublicReport } from "../components/MapView";
import { ClassDot, ErrorBox, Note, PageHeader, ProvenanceBadge } from "../components/ui";
import { EMPTY_FILTERS, type Feature, type FilterState } from "../lib/api";
import { useApi, useApp, usePageMeta } from "../lib/hooks";

export default function MapPage() {
  usePageMeta("Interactive map", "Map of surveyed street lighting in Dehradun: over-lit, under-lit, non-functional and adequate locations with evidence.");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [debounced, setDebounced] = useState(filters);
  const [focus, setFocus] = useState<[number, number] | null>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(filters), 250); return () => clearTimeout(t); }, [filters]);
  const { data, error, loading, reload } = useApi<{ count: number; items: Feature[] }>("/locations", { ...debounced });
  const reports = useApi<{ items: PublicReport[] }>("/reports/public");
  const items = data?.items ?? [];
  const { meta } = useApp();
  const all = useApi<{ items: Feature[] }>("/locations");
  // Centre of each area = average position of its locations (used to fly the map there).
  const centres: Record<string, [number, number]> = {};
  for (const z of meta?.zones ?? []) {
    const pts = (all.data?.items ?? []).filter((f) => f.zone === z);
    if (pts.length) centres[z] = [pts.reduce((a, f) => a + f.latitude, 0) / pts.length, pts.reduce((a, f) => a + f.longitude, 0) / pts.length];
  }
  const pickArea = (z: string) => { setFilters({ ...filters, zone: z }); if (z && centres[z]) setFocus(centres[z]); };
  return (
    <>
      <PageHeader help="map" title="Interactive map of Dehradun" lead="Click a marker for its measurement, fixture details, verification status and suggested action. Each marker is drawn as a point of light: the wider the glow, the brighter the reading. A dotted outer ring marks demo data." />
      {(meta?.zones.length ?? 0) > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Jump to an area">
          <span className="text-sm font-medium text-muted">Jump to</span>
          {["", ...(meta?.zones ?? [])].map((z) => (
            <button key={z || "all"} onClick={() => pickArea(z)} aria-pressed={filters.zone === z}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${filters.zone === z ? "border-transparent bg-brand text-brand-ink" : "border-line bg-surface hover:border-accent"}`}>{z || "All areas"}</button>
          ))}
        </div>
      )}
      <Filters value={filters} onChange={setFilters} search />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div>
          {error ? <ErrorBox message={error} retry={reload} /> : <MapView features={items} reports={reports.data?.items ?? []} focus={focus} />}
          <p className="mt-2 text-xs text-muted" aria-live="polite">{loading ? "Loading locations…" : `${items.length} location${items.length === 1 ? "" : "s"} shown.`} Use the layers button (top right of the map) to switch markers, the lux heatmap and citizen reports on or off.</p>
        </div>
        <aside className="space-y-3">
          <Note>Markers come from ground surveys. This map does not show satellite data, and a missing marker means "not surveyed", not "no problem".</Note>
          <div className="rounded-xl border border-line bg-surface">
            <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Locations {filters.q && `matching “${filters.q}”`}</h2>
            {items.length === 0 && !loading ? <p className="p-4 text-sm text-muted">No locations match. Try resetting the filters.</p> : (
              <ul className="max-h-[52vh] divide-y divide-line overflow-y-auto text-sm">
                {items.slice(0, 200).map((f) => (
                  <li key={f.id}>
                    <button className="w-full px-4 py-2 text-left hover:bg-raised" onClick={() => setFocus([f.latitude, f.longitude])}>
                      <span className="flex items-center gap-2 font-medium"><ClassDot k={f.latest.classification} />{f.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">{f.zone && <span>{f.zone}</span>}<ProvenanceBadge origin={f.latest.data_origin} verification={f.latest.verification_status} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {items.length > 200 && <p className="border-t border-line px-4 py-2 text-xs text-muted">Showing 200 of {items.length}. Search or filter to narrow the list.</p>}
          </div>
        </aside>
      </div>
    </>
  );
}
