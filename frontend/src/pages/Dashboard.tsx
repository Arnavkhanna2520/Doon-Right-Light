import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Filters } from "../components/Filters";
import { Card, Empty, ErrorBox, Note, PageHeader, Spinner } from "../components/ui";
import { EMPTY_FILTERS, type FilterState } from "../lib/api";
import { CLASS_KEYS, CLASS_META, REPORT_STATUS, fmtNum } from "../lib/format";
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
/** The page in one sentence and one bar: how the checked places split between too bright, right, too dim and broken. */
function LightBalance({ k }: { k: any }) {
  const parts = [
    { key: "potential_excessive", n: k.potential_excessive, words: "too bright", verb: true },
    { key: "adequate", n: k.adequate, words: "lit about right", verb: true },
    { key: "insufficient", n: k.insufficient, words: "too dim", verb: true },
    { key: "non_functional", n: k.non_functional, words: "not working", verb: true },
    { key: "needs_investigation", n: k.needs_investigation, words: k.needs_investigation === 1 ? "needs more checking" : "need more checking", verb: false },
  ].filter((p) => p.n > 0);
  const total = k.monitored_locations;
  return (
    <section aria-label="Light balance" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <p className="display text-xl font-semibold leading-snug sm:text-2xl">
        Of {fmtNum(total)} places checked, {parts.map((p, i) => (
          <span key={p.key}>{i > 0 && (i === parts.length - 1 ? " and " : ", ")}<span style={{ color: CLASS_META[p.key].color }}>{fmtNum(p.n)} {p.verb ? (p.n === 1 ? "is " : "are ") : ""}{p.words}</span></span>
        ))}.
      </p>
      <div className="mt-4 flex h-4 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.n} ${p.words}`).join(", ")}>
        {parts.map((p) => <span key={p.key} title={`${p.n} ${p.words}`} style={{ width: `${(p.n / total) * 100}%`, background: CLASS_META[p.key].color }} />)}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        {parts.map((p) => <li key={p.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: CLASS_META[p.key].color }} />{CLASS_META[p.key].short} {Math.round((p.n / total) * 100)}%</li>)}
      </ul>
    </section>
  );
}

const H = 260;
const PROBLEMS = ["potential_excessive", "insufficient", "non_functional"] as const;

export default function Dashboard() {
  usePageMeta("Dashboard", "How street lighting in Dehradun is doing: places checked, too bright, too dim and not working, by area.");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const { data, error, loading, reload } = useApi("/stats", { ...filters });
  const k = data?.kpis;
  const cls = (data?.by_classification ?? []).map((d: any) => ({ ...d, name: CLASS_META[d.key].short }));
  // Areas ranked by how many places have a problem (too bright, too dim or not working).
  const zones = (data?.by_zone ?? []).map((z: any) => ({
    ...z, problems: PROBLEMS.reduce((n, c) => n + (z[c] ?? 0), 0), total: CLASS_KEYS.reduce((n, c) => n + (z[c] ?? 0), 0),
  })).sort((a: any, b: any) => b.problems - a.problems || a.zone.localeCompare(b.zone));
  const worst = zones.slice(0, 10);
  const reports = (data?.reports?.by_status ?? []).map((d: any) => ({ ...d, name: REPORT_STATUS[d.key] ?? d.key }));
  return (
    <>
      <PageHeader help="dashboard" title="Dashboard" lead="How street lighting is doing across the places checked. Use the filters to look at one area, one kind of problem or a date range." />
      <Filters value={filters} onChange={setFilters} />
      <div className="mt-6 space-y-6">
        {error && <ErrorBox message={error} retry={reload} />}
        {loading && !data && <Spinner />}
        {data && k.monitored_locations === 0 && (
          <Empty title="No readings match these filters">Reset the filters, or <Link className="text-info underline" to="/upload">upload a survey</Link>.</Empty>
        )}
        {data && (
          <>
            {k.demo_locations > 0 && <Note tone="warn"><strong>{fmtNum(k.demo_locations)} of {fmtNum(k.monitored_locations)} places below are demo data.</strong> The areas are real, the numbers are invented examples. Use the Data source filter to hide them.</Note>}
            {k.monitored_locations > 0 && <LightBalance k={k} />}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Places checked" value={k.monitored_locations} />
              <Kpi label="Too bright" value={k.potential_excessive} color={CLASS_META.potential_excessive.color} hint="Wastes energy and adds to light pollution" />
              <Kpi label="Too dim" value={k.insufficient} color={CLASS_META.insufficient.color} hint="Below the lux range for the road type" />
              <Kpi label="Not working" value={k.non_functional} color={CLASS_META.non_functional.color} hint={`Recorded in surveys. Residents have separately reported ${data.reports.faulty_streetlight_reports} broken lights.`} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Condition of all places checked" hint="How many places fall in each group">
                <ResponsiveContainer width="100%" height={H}>
                  <BarChart data={cls} margin={{ left: -16 }}>
                    <CartesianGrid vertical={false} /><XAxis dataKey="name" tickLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "var(--raised)" }} />
                    <Bar dataKey="count" name="Places" radius={[4, 4, 0, 0]}>{cls.map((d: any) => <Cell key={d.key} fill={CLASS_META[d.key].color} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card title="Areas that need the most attention" hint="Places too bright, too dim or not working, top 10 areas">
                {worst.length === 0 ? <Empty title="No areas recorded" /> : (
                  <ResponsiveContainer width="100%" height={Math.max(H, worst.length * 26 + 40)}>
                    <BarChart data={worst} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid horizontal={false} /><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="zone" width={130} tickLine={false} interval={0} />
                      <Tooltip cursor={{ fill: "var(--raised)" }} />
                      {PROBLEMS.map((c) => <Bar key={c} dataKey={c} name={CLASS_META[c].short} stackId="p" fill={CLASS_META[c].color} />)}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
              <Card className="lg:col-span-2" title="Condition in every area" hint="Each bar is one area, split by condition; areas with the most problems first">
                {zones.length === 0 ? <Empty title="No areas recorded" /> : (
                  <ResponsiveContainer width="100%" height={zones.length * 24 + 70}>
                    <BarChart data={zones} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid horizontal={false} /><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="zone" width={150} tickLine={false} interval={0} />
                      <Tooltip cursor={{ fill: "var(--raised)" }} /><Legend />
                      {CLASS_KEYS.map((c) => <Bar key={c} dataKey={c} name={CLASS_META[c].short} stackId="a" fill={CLASS_META[c].color} />)}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
              <Card className="lg:col-span-2" title="Residents' reports" hint={`${fmtNum(data.reports.total)} reports, by where they are in review`}>
                {data.reports.total === 0 ? <Empty title="No reports from residents yet"><Link className="text-info underline" to="/report">Submit the first one</Link>.</Empty> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={reports} margin={{ left: -16 }}>
                      <CartesianGrid vertical={false} /><XAxis dataKey="name" tickLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "var(--raised)" }} />
                      <Bar dataKey="count" name="Reports" fill="var(--info)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}
