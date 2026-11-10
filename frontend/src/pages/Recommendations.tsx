import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Card, Empty, ErrorBox, Field, Note, PageHeader, Pagination, Select, Spinner } from "../components/ui";
import type { Rec } from "../lib/api";
import { PRIORITY_COLOR, human } from "../lib/format";
import { useApi, useApp, usePageMeta } from "../lib/hooks";

function RecCard({ r }: { r: Rec }) {
  return (
    <li className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold">{r.safety_hold && <ShieldAlert className="size-4 text-info" aria-hidden />}{r.title}</p>
          {r.location && <p className="mt-0.5 text-sm text-muted">{r.location.name}{r.location.zone && ` · ${r.location.zone}`} · {human(r.location.road_type)} road</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {r.evidence_level === "demo" ? <Badge tone="demo">Demo data</Badge> : r.evidence_level === "verified" ? <Badge tone="ok">Verified observation</Badge> : <Badge tone="warn">Unverified</Badge>}
          {r.location?.safety_critical && <Badge tone="info" title={r.location.safety_context}>Safety-critical</Badge>}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs font-semibold"><span className="size-2 rounded-full" style={{ background: PRIORITY_COLOR[r.priority_level] }} />{human(r.priority_level)} priority · <span className="tabular">{r.priority_score}</span></span>
        </div>
      </div>
      <p className="mt-3 text-sm">{r.rationale}</p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-info">Evidence behind this recommendation</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{r.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
      </details>
    </li>
  );
}

export default function Recommendations() {
  usePageMeta("Recommendations", "Evidence-based, safety-aware suggestions for improving street lighting at surveyed locations in Dehradun.");
  const { meta } = useApp();
  const [sp] = useSearchParams();
  const locId = sp.get("location");
  const [level, setLevel] = useState("");
  const [action, setAction] = useState("");
  const [zone, setZone] = useState("");
  const [page, setPage] = useState(1);
  const list = useApi(locId ? null : "/recommendations", { level, action, zone, page, page_size: 10 });
  const one = useApi(locId ? `/locations/${locId}` : null);
  const items: Rec[] = locId ? (one.data?.recommendations ?? []).map((r: Rec) => ({ ...r, location: one.data })) : list.data?.items ?? [];
  const state = locId ? one : list;
  const reset = (fn: (v: string) => void) => (e: { target: { value: string } }) => { fn(e.target.value); setPage(1); };
  return (
    <>
      <PageHeader title="Recommendations" lead="Suggested actions for surveyed locations, ranked by priority. Each one shows the measurement and reasoning behind it. They are options for a qualified engineer to assess, not instructions." />
      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <Note><strong>How priority is scored.</strong> Priority = severity × exposure × confidence, from 0 to 100. Severity is how far the reading is from the configured range, exposure reflects recorded pedestrian and vehicle activity, and confidence is lower for unverified data.</Note>
        <Note tone="warn"><strong>Safety rule.</strong> The engine never suggests lowering light at a location flagged safety-critical, such as a junction, crossing, hospital or bus stop. It asks for an on-site safety assessment. Unverified readings only produce a request to re-measure.</Note>
      </div>
      {locId ? (
        <p className="mb-4 text-sm">Showing recommendations for <strong>{one.data?.name ?? "…"}</strong>. <a className="text-info underline" href="/recommendations">Show all</a></p>
      ) : (
        <Card className="mb-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Priority"><Select value={level} onChange={reset(setLevel)} placeholder="Any priority" options={[["high", "High"], ["medium", "Medium"], ["low", "Low"]]} /></Field>
            <Field label="Action"><Select value={action} onChange={reset(setAction)} placeholder="Any action" options={Object.entries(meta?.enums.actions ?? {}) as [string, string][]} /></Field>
            <Field label="Zone"><Select value={zone} onChange={reset(setZone)} placeholder="All zones" options={(meta?.zones ?? []).map((z) => [z, z])} /></Field>
          </div>
        </Card>
      )}
      {state.error && <ErrorBox message={state.error} retry={state.reload} />}
      {state.loading && !state.data && <Spinner />}
      {state.data && items.length === 0 && <Empty title="No recommendations for this selection">Recommendations appear once observations have been imported and classified.</Empty>}
      <ul className="space-y-3">{items.map((r) => <RecCard key={r.id} r={r} />)}</ul>
      {!locId && list.data && <Pagination page={page} pageSize={10} total={list.data.total} onPage={setPage} />}
    </>
  );
}
