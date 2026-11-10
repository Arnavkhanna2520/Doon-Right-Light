import { Download } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ErrorBar, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Filters } from "../components/Filters";
import { Badge, Button, Card, Empty, ErrorBox, Field, Note, PageHeader, Select, Spinner, Table, Td } from "../components/ui";
import { EMPTY_FILTERS, download, type FilterState } from "../lib/api";
import { fmtNum, human } from "../lib/format";
import { can, useApi, useApp, usePageMeta } from "../lib/hooks";

const HOT: Record<string, { label: string; color: string }> = {
  hot_99: { label: "High-lux cluster (99%)", color: "#b45309" }, hot_95: { label: "High-lux cluster (95%)", color: "#d97706" },
  hot_90: { label: "High-lux cluster (90%)", color: "#f5a524" }, cold_99: { label: "Low-lux cluster (99%)", color: "#3730a3" },
  cold_95: { label: "Low-lux cluster (95%)", color: "#4f46e5" }, cold_90: { label: "Low-lux cluster (90%)", color: "#818cf8" },
  not_significant: { label: "Not significant", color: "var(--c-investigate)" },
};

function Quality({ label, pct, hint }: { label: string; pct: number; hint: string }) {
  return (
    <div title={hint}>
      <div className="flex justify-between text-sm"><span className="text-muted">{label}</span><span className="tabular font-medium">{pct}%</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded bg-raised" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}><div className="h-full bg-info" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default function Analysis() {
  usePageMeta("Light pollution analysis", "Brightness distributions, hotspot statistics and data-quality indicators for ground lighting surveys in Dehradun.");
  const { user, meta } = useApp();
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [radius, setRadius] = useState("750");
  const [busy, setBusy] = useState(false);
  const [dlError, setDlError] = useState("");
  const sum = useApi("/analysis/summary", { ...filters });
  const hot = useApi("/analysis/hotspots", { ...filters, radius_m: radius });
  const dq = sum.data?.data_quality;
  const box = (sum.data?.lux_by_road_type ?? []).map((r: any) => ({ ...r, name: human(r.road_type), range: [r.median - r.q1, r.q3 - r.median] }));
  const sig = (hot.data?.results ?? []).filter((r: any) => r.label !== "not_significant").sort((a: any, b: any) => Math.abs(b.z) - Math.abs(a.z));
  const counts: Record<string, number> = {};
  for (const r of hot.data?.results ?? []) counts[r.label] = (counts[r.label] ?? 0) + 1;
  const sat = meta?.satellite;
  async function dl() {
    setBusy(true); setDlError("");
    try { await download("/exports/hotspots.csv", { ...filters, radius_m: radius }); } catch (e: any) { setDlError(e.message); } finally { setBusy(false); }
  }
  return (
    <>
      <PageHeader title="Light pollution analysis" lead="Ground lux distributions, clustering and data quality. Read the satellite note below before comparing anything here with night-time imagery." />
      <Filters value={filters} onChange={setFilters} />
      <div className="mt-6 space-y-6">
        <Card title="Satellite radiance versus ground-level light" hint="They measure different things and must not be read as the same quantity.">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="text-sm">
              <h3 className="font-semibold">What a satellite sees</h3>
              <p className="mt-1 text-muted">NASA Black Marble ({sat?.product}) records light travelling upward to the sensor, at about {sat?.resolution.replace(/.*\(|\)/g, "")} per pixel, once a night at around 01:30. It is good for city-wide trends.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{sat?.limitations.slice(0, 4).map((l) => <li key={l}>{l}</li>)}</ul>
            </div>
            <div className="text-sm">
              <h3 className="font-semibold">What a lux meter sees</h3>
              <p className="mt-1 text-muted">Light actually arriving on the road at one point and time. Only ground measurement, together with a look at the fixture, can show glare, poor aiming, or whether a single streetlight works.</p>
              <div className="mt-3"><Note tone={sat?.configured ? "info" : "warn"}><strong>Satellite integration status:</strong> {sat?.message} <a className="underline" href={sat?.source_url} rel="noreferrer">Product page</a>.</Note></div>
            </div>
          </div>
        </Card>

        {sum.error && <ErrorBox message={sum.error} retry={sum.reload} />}
        {sum.loading && !sum.data && <Spinner />}
        {dq && dq.locations === 0 && <Empty title="No observations match these filters" />}
        {dq && dq.locations > 0 && (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Data-quality indicators" hint={`${fmtNum(dq.locations)} locations in scope`}>
              <div className="space-y-4">
                <Quality label="With a lux reading" pct={dq.with_lux_pct} hint="Share of locations whose latest observation includes a lux value" />
                <Quality label="Verified, real data" pct={dq.verified_real_pct} hint="Share that is non-demo and checked by an authorised person" />
                <Quality label="Visited more than once" pct={dq.repeat_visit_pct} hint="Repeat visits make a reading more trustworthy" />
                <Quality label="Demo data" pct={dq.demo_pct} hint="Synthetic demonstration records" />
              </div>
              {dq.demo_pct > 0 && <p className="mt-4 text-xs text-accent">Results on this page include demo data and are illustrative only.</p>}
            </Card>
            <Card title="Brightness distribution" hint="Locations by ground lux" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={sum.data.lux_histogram} margin={{ left: -16 }}>
                  <CartesianGrid vertical={false} /><XAxis dataKey="bin" tickLine={false} unit=" lx" /><YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "var(--raised)" }} /><Bar dataKey="count" name="Locations" fill="var(--c-excess)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Location comparison by road type" hint="Median lux; the whisker spans the middle half of readings (25th to 75th percentile)" className="lg:col-span-3">
              {box.length === 0 ? <Empty title="No lux readings" /> : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={box} margin={{ left: -16 }}>
                    <CartesianGrid vertical={false} /><XAxis dataKey="name" tickLine={false} /><YAxis tickLine={false} axisLine={false} unit=" lx" width={64} />
                    <Tooltip cursor={{ fill: "var(--raised)" }} formatter={(_v: any, _n: any, p: any) => [`median ${p.payload.median} lx (n=${p.payload.n}, range ${p.payload.min}–${p.payload.max})`, "Lux"]} />
                    <Bar dataKey="median" fill="var(--info)" radius={[4, 4, 0, 0]}><ErrorBar dataKey="range" width={6} stroke="var(--ink)" /></Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        )}

        <Card title="Potential hotspot identification (Getis-Ord Gi*)" hint="Where high or low lux readings cluster more than chance would produce"
          actions={
            <div className="flex items-end gap-2">
              <div className="w-36"><Field label="Distance band"><Select value={radius} onChange={(e) => setRadius(e.target.value)} options={[["300", "300 m"], ["500", "500 m"], ["750", "750 m"], ["1000", "1 km"], ["1500", "1.5 km"]]} /></Field></div>
              {can(user, "auditor", "moderator") && <Button variant="outline" busy={busy} onClick={dl}><Download className="size-4" aria-hidden />CSV</Button>}
            </div>
          }>
          {dlError && <div className="mb-3"><ErrorBox message={dlError} /></div>}
          {hot.error && <ErrorBox message={hot.error} retry={hot.reload} />}
          {hot.loading && !hot.data && <Spinner />}
          {hot.data && hot.data.status !== "ok" && <Empty title="Hotspot analysis is not available for this selection">{hot.data.message}</Empty>}
          {hot.data?.status === "ok" && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                {hot.data.contains_demo && <Badge tone="demo">Includes demo data</Badge>}
                <span className="text-muted">{hot.data.n} locations · mean {hot.data.mean} lx · {hot.data.isolated} with no neighbour inside the band</span>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                {Object.entries(HOT).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs"><span className="size-2.5 rounded-full" style={{ background: v.color }} />{v.label}: <strong className="tabular">{counts[k] ?? 0}</strong></span>)}
              </div>
              {sig.length === 0 ? <Empty title="No statistically significant clusters at this distance band" /> : (
                <Table head={["Location", "Zone", "Lux", "z-score", "Neighbours", "Result"]}>
                  {sig.slice(0, 25).map((r: any) => (
                    <tr key={r.id}><Td className="font-medium">{r.name}</Td><Td>{r.zone}</Td><Td className="tabular">{r.lux}</Td><Td className="tabular">{r.z}</Td><Td className="tabular">{r.neighbours}</Td>
                      <Td><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: HOT[r.label].color }} />{HOT[r.label].label}</span></Td></tr>
                  ))}
                </Table>
              )}
              <p className="mt-3 text-xs text-muted">A high-lux cluster means brighter than the survey average, not necessarily excessive: a busy junction should be bright. Results change with the distance band, and testing many locations at once produces some false positives. Treat clusters as places to look, then check the classification and the fixture record.</p>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
