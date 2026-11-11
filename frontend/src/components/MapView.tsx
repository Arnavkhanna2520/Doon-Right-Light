import L from "leaflet";
import { HeatLayer } from "leaflet.heat";
import { useLeafletContext } from "@react-leaflet/core";
import { useEffect, useMemo, useState } from "react";
import { LayerGroup, LayersControl, MapContainer, Marker, Popup, Rectangle, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { Link } from "react-router-dom";
import { get, type Feature, type Rec } from "../lib/api";
import { CLASS_META, REPORT_CATEGORY, REPORT_STATUS, fmtDate, human } from "../lib/format";
import { useApp } from "../lib/hooks";
import { Badge, ProvenanceBadge, markerSvg } from "./ui";

const MAX_MARKERS = 1500;
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// Standard OpenStreetMap street maps: free, no API key, and they look like a normal map in both themes.
// (Google Maps tiles need a paid Google API key and Google's terms do not allow them in Leaflet.)
const BASEMAPS = {
  night: { name: "Night", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: OSM },
  day: { name: "Light", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: OSM },
  streets: { name: "Street detail", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: OSM },
};
const TILE = BASEMAPS.streets.url;
const ATTR = OSM;

const iconCache = new Map<string, L.DivIcon>();
function iconFor(cls: string, demo: boolean): L.DivIcon {
  const key = `${cls}|${demo}`;
  if (!iconCache.has(key)) {
    iconCache.set(key, L.divIcon({ className: "drl-marker", html: markerSvg(cls, 28, demo), iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -10] }));
  }
  return iconCache.get(key)!;
}
const reportIcon = L.divIcon({
  className: "drl-marker", iconSize: [18, 18], iconAnchor: [9, 9],
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="18" height="18"><path d="M10 1.5c-3.6 0-6.5 2.6-6.5 6.2 0 4.4 6.5 10.8 6.5 10.8s6.5-6.4 6.5-10.8c0-3.6-2.9-6.2-6.5-6.2z" fill="var(--info)" stroke="var(--surface)" stroke-width="1.5"/><circle cx="10" cy="7.8" r="2.2" fill="var(--surface)"/></svg>`,
});
export const pinIcon = L.divIcon({
  className: "drl-marker", iconSize: [28, 28], iconAnchor: [14, 27],
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="28" height="28"><path d="M10 1.5c-3.6 0-6.5 2.6-6.5 6.2 0 4.4 6.5 10.8 6.5 10.8s6.5-6.4 6.5-10.8c0-3.6-2.9-6.2-6.5-6.2z" fill="var(--accent)" stroke="var(--surface)" stroke-width="1.5"/><circle cx="10" cy="7.8" r="2.2" fill="var(--surface)"/></svg>`,
});

function Heat({ points }: { points: [number, number, number][] }) {
  // Attach to the enclosing LayerGroup so the layer-control checkbox switches it on and off.
  const ctx = useLeafletContext();
  useEffect(() => {
    if (!points.length) return;
    const container = ctx.layerContainer ?? ctx.map;
    const layer = new HeatLayer(points, { radius: 26, blur: 20, maxZoom: 15, minOpacity: 0.25 }) as unknown as L.Layer;
    container.addLayer(layer);
    return () => { container.removeLayer(layer); };
  }, [ctx, points]);
  return null;
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo(target, 15, { duration: 0.6 }); }, [map, target]);
  return null;
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-b border-line/60 py-1 last:border-0"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{children}</dd></div>;
}

function LocationPopup({ f }: { f: Feature }) {
  const [recs, setRecs] = useState<Rec[] | null>(null);
  useEffect(() => { get(`/locations/${f.id}`).then((d) => setRecs(d.recommendations)).catch(() => setRecs([])); }, [f.id]);
  const o = f.latest;
  return (
    <div className="text-[13px] leading-snug">
      <p className="text-sm font-semibold">{f.name}</p>
      <p className="mb-2 mt-1 flex flex-wrap gap-1"><ProvenanceBadge origin={o.data_origin} verification={o.verification_status} />{f.safety_critical && <Badge tone="info" title={f.safety_context}>Safety-critical</Badge>}</p>
      <dl>
        <Row k="Classification">{CLASS_META[o.classification]?.label}</Row>
        <Row k="Coordinates"><span className="tabular">{f.latitude.toFixed(5)}, {f.longitude.toFixed(5)}</span></Row>
        <Row k="Measured">{fmtDate(o.measured_at)}</Row>
        <Row k="Lux">{o.lux === null ? "Not measured" : `${o.lux} lux`}</Row>
        <Row k="Fixture">{human(o.fixture_status)}{o.fixture_wattage ? `, ${o.fixture_wattage} W` : ""}</Row>
        <Row k="Shielding / direction">{human(o.shielding)} / {human(o.light_direction)}</Row>
        {f.zone && <Row k="Area">{f.zone}</Row>}
        <Row k="Road type">{human(f.road_type)}</Row>
        {o.notes && <Row k="Reported issue / notes">{o.notes}</Row>}
      </dl>
      <p className="mt-2 text-xs text-muted">{o.classification_basis}</p>
      <div className="mt-2 rounded-md bg-raised p-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Recommended action</p>
        {recs === null ? <p className="text-muted">Loading…</p> : recs.length === 0 ? <p>No action suggested.</p> :
          <ul className="mt-1 list-disc pl-4">{recs.slice(0, 3).map((r) => <li key={r.id}>{r.title}</li>)}</ul>}
      </div>
      <Link to={`/recommendations?location=${f.id}`} className="mt-2 inline-block text-info underline">See evidence</Link>
    </div>
  );
}

export interface PublicReport { public_id: string; category: string; status: string; is_demo: boolean; latitude: number; longitude: number; submitted_at: string }

export default function MapView({ features, reports = [], focus = null, height = "70vh" }: {
  features: Feature[]; reports?: PublicReport[]; focus?: [number, number] | null; height?: string;
}) {
  const { meta, theme } = useApp();
  const shown = useMemo(() => features.slice(0, MAX_MARKERS), [features]);
  const heat = useMemo(() => {
    const lux = features.filter((f) => f.latest.lux !== null);
    const max = Math.max(1, ...lux.map((f) => f.latest.lux as number));
    return lux.map((f) => [f.latitude, f.longitude, (f.latest.lux as number) / max] as [number, number, number]);
  }, [features]);
  if (!meta) return null;
  const a = meta.study_area;
  return (
    <div style={{ height }} className="relative overflow-hidden rounded-2xl border border-line">
      <MapContainer center={a.center} zoom={13} minZoom={10} maxZoom={18} scrollWheelZoom className="size-full" aria-label="Map of Dehradun lighting observations">
        <FlyTo target={focus} />
        <LayersControl position="topright" collapsed key={theme}>
          {(theme === "dark" ? ["night", "day", "streets"] as const : ["day", "night", "streets"] as const).map((k, i) => (
            <LayersControl.BaseLayer key={k} checked={i === 0} name={`${BASEMAPS[k].name} basemap`}>
              <TileLayer url={BASEMAPS[k].url} attribution={BASEMAPS[k].attr} subdomains="abc" />
            </LayersControl.BaseLayer>
          ))}
          <LayersControl.Overlay checked name={`Lighting observations (${shown.length})`}>
            <LayerGroup>
              {shown.map((f) => (
                <Marker key={f.id} position={[f.latitude, f.longitude]} icon={iconFor(f.latest.classification, f.latest.data_origin === "demo")}
                  title={`${f.name}: ${CLASS_META[f.latest.classification]?.label}`} alt={`${f.name}: ${CLASS_META[f.latest.classification]?.label}`}>
                  <Popup maxWidth={320}><LocationPopup f={f} /></Popup>
                </Marker>
              ))}
            </LayerGroup>
          </LayersControl.Overlay>
          <LayersControl.Overlay name="Heatmap of ground lux readings">
            <LayerGroup><Heat points={heat} /></LayerGroup>
          </LayersControl.Overlay>
          <LayersControl.Overlay checked name={`Reviewed citizen reports (${reports.length})`}>
            <LayerGroup>
              {reports.map((r) => (
                <Marker key={r.public_id} position={[r.latitude, r.longitude]} icon={reportIcon} title={`Citizen report: ${REPORT_CATEGORY[r.category]}`}>
                  <Popup>
                    <div className="text-[13px]">
                      <p className="text-sm font-semibold">Citizen report {r.public_id}</p>
                      <p className="my-1 flex gap-1">{r.is_demo ? <Badge tone="demo">Demo data</Badge> : <Badge tone="info">Citizen report</Badge>}<Badge>{REPORT_STATUS[r.status]}</Badge></p>
                      <p>{REPORT_CATEGORY[r.category]}</p>
                      <p className="mt-1 text-xs text-muted">Submitted {fmtDate(r.submitted_at, false)}. Position rounded to about 100 m to protect the reporter's privacy.</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </LayerGroup>
          </LayersControl.Overlay>
          <LayersControl.Overlay name="Approximate study area">
            <Rectangle bounds={[[a.min_lat, a.min_lon], [a.max_lat, a.max_lon]]} pathOptions={{ color: "#ffb347", weight: 1.5, fill: false, dashArray: "6 6" }} />
          </LayersControl.Overlay>
        </LayersControl>
      </MapContainer>
      <div className="pointer-events-none absolute bottom-6 left-3 z-[400] max-w-[15rem] rounded-xl border border-line bg-surface/90 p-3 text-xs backdrop-blur" aria-label="Map legend">
        <p className="mb-1.5 font-semibold">Legend</p>
        <ul className="space-y-1">
          {Object.entries(CLASS_META).map(([k, m]) => (
            <li key={k} className="flex items-center gap-2"><span dangerouslySetInnerHTML={{ __html: markerSvg(k, 18, false) }} />{m.label}</li>
          ))}
          <li className="flex items-center gap-2"><span dangerouslySetInnerHTML={{ __html: markerSvg("adequate", 18, true) }} />Dotted outer ring = demo data</li>
          <li className="flex items-center gap-2"><span dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 20 20" width="14" height="14"><path d="M10 1.5c-3.6 0-6.5 2.6-6.5 6.2 0 4.4 6.5 10.8 6.5 10.8s6.5-6.4 6.5-10.8c0-3.6-2.9-6.2-6.5-6.2z" fill="var(--info)"/></svg>` }} />Reviewed citizen report</li>
        </ul>
        {features.length > MAX_MARKERS && <p className="mt-2 text-muted">Showing the first {MAX_MARKERS} of {features.length} locations. Narrow the filters to see the rest.</p>}
      </div>
    </div>
  );
}

/** Small map for choosing a point (citizen report form). */
export function PinPicker({ value, onChange }: { value: [number, number] | null; onChange: (v: [number, number] | null) => void }) {
  const { meta } = useApp();
  function Clicker() {
    useMapEvents({ click: (e) => onChange([Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5))]) });
    return null;
  }
  if (!meta) return null;
  return (
    <div className="h-64 overflow-hidden rounded-lg border border-line">
      <MapContainer center={value ?? meta.study_area.center} zoom={13} className="size-full" scrollWheelZoom={false}>
        <TileLayer url={TILE} attribution={ATTR} />
        <Clicker />
        {value && <Marker position={value} icon={pinIcon} draggable eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); onChange([Number(p.lat.toFixed(5)), Number(p.lng.toFixed(5))]); } }} />}
      </MapContainer>
    </div>
  );
}
