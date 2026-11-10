import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Filters } from "../components/Filters";
import { Card, Empty, ErrorBox, Field, Input, Note, PageHeader, Spinner } from "../components/ui";
import { EMPTY_FILTERS, type FilterState } from "../lib/api";
import { CLASS_KEYS, CLASS_META, PRIORITY_COLOR, REPORT_CATEGORY, REPORT_STATUS, fmtNum, human } from "../lib/format";
import { useApi, usePageMeta } from "../lib/hooks";

/** Numbers roll to their new value when the data or filters change, so a change is noticed. */
function useCountUp(target: number | undefined) {
  const [shown, setShown] = useState(target ?? 0);
  const from = useRef(0);
  useEffect(() => {
    if (target === undefined) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(target); from.current = target; return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 500);
      setShown(Math.round(a + (target - a) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target]);
  return target === undefined ? undefined : shown;
}

function Kpi({ label, value, color, hint }: { label: string; value: number | undefined; color?: string; hint?: string }) {
  const shown = useCountUp(value);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4" title={hint}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: color ?? "var(--line)" }} />
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="display tabular mt-2 text-4xl font-semibold" style={{ color }}>{fmtNum(shown)}</p>
    </div>
  );
}
const H = 260;

export default function Dashboard() {
  usePageMeta("Dashboard", "Counts, zone comparisons, trends and priority levels for surveyed street lighting in Dehradun.");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [hours, setHours] = useState(11);
  const { data, error, loading, reload } = useApi("/stats", { ...filters });
  const k = data?.kpis;
  const cls = (data?.by_classification ?? []).map((d: any) => ({ ...d, name: CLASS_META[d.key].short }));
  const energy = (data?.wattage_by_classification ?? []).map((d: any) => ({
    name: CLASS_META[d.key]?.short ?? d.key, key: d.key, kwh: Math.round((d.total_watts / 1000) * hours * 10) / 10, fixtures: d.fixtures,
  }));
  return (
    <>
      <PageHeader title="Monitoring dashboard" lead="Every figure is counted from the latest observation at each surveyed location, within the filters you choose." />
      <Filters value={filters} onChange={setFilters} />
      <div className="mt-6 space-y-6">
        {error && <ErrorBox message={error} retry={reload} />}
        {loading && !data && <Spinner />}
        {data && k.monitored_locations === 0 && (
          <Empty title="No observations match these filters">Reset the filters, or <Link className="text-info underline" to="/audit">import a ground survey</Link>.</Empty>
        )}
        {data && (
          <>
            {k.demo_locations > 0 && <Note tone="warn"><strong>{fmtNum(k.demo_locations)} of {fmtNum(k.monitored_locations)} locations below are demo data.</strong> They are synthetic and say nothing about real lighting in Dehradun. Use the Data source filter to exclude them.</Note>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              <Kpi label="Monitored locations" value={k.monitored_locations} />
              <Kpi label="Potential hotspots" value={k.potential_excessive + k.insufficient + k.non_functional} hint="Locations classified as excessive, insufficient or non-functional" />
              <Kpi label="Excessively illuminated" value={k.potential_excessive} color={CLASS_META.potential_excessive.color} />
              <Kpi label="Insufficiently illuminated" value={k.insufficient} color={CLASS_META.insufficient.color} />
              <Kpi label="Faulty streetlights" value={k.non_functional} color={CLASS_META.non_functional.color} hint={`Recorded in surveys. Citizens have separately reported ${data.reports.faulty_streetlight_reports} broken lights.`} />
              <Kpi label="Citizen reports" value={data.reports.total} hint={data.reports.demo ? `${data.reports.demo} are demo reports` : "All statuses"} />
              <Kpi label="High-priority locations" value={k.high_priority} color={PRIORITY_COLOR.high} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Lighting condition distribution" hint="Locations by classification">
                <ResponsiveContainer width="100%" height={H}>
                  <BarChart data={cls} margin={{ left: -16 }}>
                    <CartesianGrid vertical={false} /><XAxis dataKey="name" tickLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "var(--raised)" }} />
                    <Bar dataKey="count" name="Locations" radius={[4, 4, 0, 0]}>{cls.map((d: any) => <Cell key={d.key} fill={CLASS_META[d.key].color} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card title="Region-wise comparison" hint="Classification mix per zone">
                {data.by_zone.length === 0 ? <Empty title="No zones recorded" /> : (
                  <ResponsiveContainer width="100%" height={H}>
                    <BarChart data={data.by_zone} margin={{ left: -16 }}>
                      <CartesianGrid vertical={false} /><XAxis dataKey="zone" tickLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "var(--raised)" }} /><Legend />
                      {CLASS_KEYS.map((c) => <Bar key={c} dataKey={c} name={CLASS_META[c].short} stackId="a" fill={CLASS_META[c].color} />)}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
              <Card title="Monthly trend" hint="Locations by the month of their latest measurement, and average lux">
                <ResponsiveContainer width="100%" height={H}>
                  <LineChart data={data.monthly} margin={{ left: -16 }}>
                    <CartesianGrid vertical={false} /><XAxis dataKey="month" tickLine={false} /><YAxis yAxisId="l" allowDecimals={false} tickLine={false} axisLine={false} /><YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} />
                    <Tooltip /><Legend />
                    <Line yAxisId="l" type="monotone" dataKey="total" name="Locations measured" stroke="var(--info)" strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="r" type="monotone" dataKey="avg_lux" name="Average lux" stroke="var(--c-excess)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
              <Card title="Priority-level distribution" hint="Highest open recommendation per location">
                <ResponsiveContainer width="100%" height={H}>
                  <PieChart>
                    <Pie data={data.by_priority.filter((d: any) => d.count)} dataKey="count" nameKey="key" innerRadius={55} outerRadius={90} paddingAngle={2}
                      label={(p: any) => p.count}>
                      {data.by_priority.filter((d: any) => d.count).map((d: any) => <Cell key={d.key} fill={PRIORITY_COLOR[d.key]} stroke="var(--surface)" />)}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [v, human(String(n))]} />
                    <Legend formatter={(v: any) => (v === "none" ? "No action needed" : `${human(String(v))} priority`)} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
              <Card title="Energy consumption estimate" hint="Recorded fixture wattage × assumed hours per night, by classification"
                actions={<div className="w-28"><Field label="Hours / night"><Input type="number" min={1} max={24} step={0.5} value={hours} onChange={(e) => setHours(Math.min(24, Math.max(1, Number(e.target.value) || 1)))} /></Field></div>}>
                {energy.length === 0 ? <Empty title="No fixture wattage recorded" /> : (
                  <>
                    <ResponsiveContainer width="100%" height={H - 40}>
                      <BarChart data={energy} margin={{ left: -8 }}>
                        <CartesianGrid vertical={false} /><XAxis dataKey="name" tickLine={false} /><YAxis tickLine={false} axisLine={false} unit=" kWh" width={70} />
                        <Tooltip cursor={{ fill: "var(--raised)" }} formatter={(v: any, _n: any, p: any) => [`${v} kWh per night (${p.payload.fixtures} fixtures)`, "Estimate"]} />
                        <Bar dataKey="kwh" radius={[4, 4, 0, 0]}>{energy.map((d: any) => <Cell key={d.key} fill={CLASS_META[d.key]?.color} />)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="mt-2 text-xs text-muted">Estimate only: one fixture per surveyed location, nameplate wattage, your assumed hours. It is not metered consumption and must not be scaled to the whole city.</p>
                  </>
                )}
              </Card>
              <Card title="Citizen reports" hint="By status and category. Reports are unverified until reviewed.">
                {data.reports.total === 0 ? <Empty title="No citizen reports yet"><Link className="text-info underline" to="/report">Submit the first one</Link>.</Empty> : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[["by_status", REPORT_STATUS], ["by_category", REPORT_CATEGORY]].map(([key, labels]: any) => (
                      <ul key={key} className="space-y-1.5 text-sm">
                        {data.reports[key].map((d: any) => (
                          <li key={d.key} className="flex items-center gap-2">
                            <span className="flex-1 truncate text-muted">{labels[d.key]}</span>
                            <span className="h-1.5 w-20 overflow-hidden rounded bg-raised"><span className="block h-full bg-info" style={{ width: `${(d.count / data.reports.total) * 100}%` }} /></span>
                            <span className="tabular w-6 text-right font-medium">{d.count}</span>
                          </li>
                        ))}
                      </ul>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}
