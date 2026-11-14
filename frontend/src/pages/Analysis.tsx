import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Filters } from "../components/Filters";
import { Badge, Card, Empty, ErrorBox, PageHeader, Spinner, Table, Td } from "../components/ui";
import { EMPTY_FILTERS, type FilterState } from "../lib/api";
import { useApi, usePageMeta } from "../lib/hooks";

// Plain-words strength of a cluster, from the Gi* confidence level.
const STRENGTH: Record<string, string> = { "99": "Very strong", "95": "Strong", "90": "Possible" };
const RADIUS = "500"; // metres: places within this distance count as neighbours

/** Group cluster points by area: how many places, their average lux, and the clearest strength found. */
function byArea(rows: any[]) {
  const m = new Map<string, { zone: string; n: number; lux: number[]; best: number }>();
  for (const r of rows) {
    const g = m.get(r.zone) ?? { zone: r.zone, n: 0, lux: [] as number[], best: 0 };
    g.n += 1; if (r.lux != null) g.lux.push(r.lux);
    g.best = Math.max(g.best, Number(r.label.split("_")[1]));
    m.set(r.zone, g);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.best - a.best);
}

function ClusterList({ title, hint, rows, tone }: { title: string; hint: string; rows: any[]; tone: "warn" | "info" }) {
  const areas = byArea(rows);
  return (
    <Card title={title} hint={hint}>
      {areas.length === 0 ? <Empty title="None found" /> : (
        <Table head={["Area", "Places in the cluster", "Their average lux", "How clear"]}>
          {areas.map((g) => (
            <tr key={g.zone}><Td className="font-medium">{g.zone}</Td><Td className="tabular">{g.n}</Td>
              <Td className="tabular">{g.lux.length ? (g.lux.reduce((a, b) => a + b, 0) / g.lux.length).toFixed(1) : "–"}</Td>
              <Td><Badge tone={tone}>{STRENGTH[String(g.best)]}</Badge></Td></tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

export default function Analysis() {
  usePageMeta("Analysis", "Where bright and dark street lights cluster in Dehradun, and how bright the places checked are.");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const sum = useApi("/analysis/summary", { ...filters });
  const hot = useApi("/analysis/hotspots", { ...filters, radius_m: RADIUS });
  const results = (hot.data?.results ?? []).slice().sort((a: any, b: any) => Math.abs(b.z) - Math.abs(a.z));
  const bright = results.filter((r: any) => r.label.startsWith("hot_"));
  const dark = results.filter((r: any) => r.label.startsWith("cold_"));
  const locations = sum.data?.data_quality?.locations ?? 0;

  return (
    <>
      <PageHeader help="analysis" title="Analysis" lead="Where bright or dark lights are grouped together, rather than scattered. A cluster is a good place to send the survey team first." />
      <Filters value={filters} onChange={setFilters} />
      <div className="mt-6 space-y-6">
        {(sum.error || hot.error) && <ErrorBox message={sum.error || hot.error || ""} retry={() => { sum.reload(); hot.reload(); }} />}
        {(sum.loading && !sum.data) || (hot.loading && !hot.data) ? <Spinner /> : null}
        {sum.data && locations === 0 && <Empty title="No readings match these filters" />}

        {hot.data && hot.data.status !== "ok" && locations > 0 && <Empty title="Not enough places to look for clusters">{hot.data.message}</Empty>}
        {hot.data?.status === "ok" && (
          <>
            {hot.data.contains_demo && <p className="text-sm"><Badge tone="demo">Includes demo data</Badge> <span className="text-muted">These clusters are worked out from invented example readings.</span></p>}
            <div className="space-y-6">
              <ClusterList title="Clusters of bright lights" hint={`Places much brighter than average, with bright neighbours within ${RADIUS} m`} rows={bright} tone="warn" />
              <ClusterList title="Clusters of dark spots" hint={`Places much darker than average, with dark neighbours within ${RADIUS} m`} rows={dark} tone="info" />
            </div>
            <p className="text-xs text-muted">A place can belong to a cluster because of its neighbours, even if its own reading is different. Bright is not always bad: a busy junction should be bright. Check each place's result on the map before acting. How clusters are found is explained on the <Link className="underline" to="/methodology">Methodology</Link> page.</p>
          </>
        )}

        {sum.data && locations > 0 && (
          <Card title="How bright the places are" hint="Number of places at each light level (lux at road level)">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={sum.data.lux_histogram} margin={{ left: -16 }}>
                <CartesianGrid vertical={false} /><XAxis dataKey="bin" tickLine={false} unit=" lx" /><YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "var(--raised)" }} /><Bar dataKey="count" name="Places" fill="var(--c-excess)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>
    </>
  );
}
