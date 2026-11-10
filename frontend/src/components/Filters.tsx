import { RotateCcw } from "lucide-react";
import { EMPTY_FILTERS, type FilterState } from "../lib/api";
import { CLASS_META, ORIGIN_LABEL, VERIFY_LABEL } from "../lib/format";
import { useApp } from "../lib/hooks";
import { Button, Field, Input, Select } from "./ui";

export function Filters({ value, onChange, search = false }: { value: FilterState; onChange: (f: FilterState) => void; search?: boolean }) {
  const { meta } = useApp();
  const set = (k: keyof FilterState) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const dirty = JSON.stringify(value) !== JSON.stringify(EMPTY_FILTERS);
  return (
    <form className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-4 xl:grid-cols-8" onSubmit={(e) => e.preventDefault()} aria-label="Filters">
      {search && <div className="col-span-2"><Field label="Search location"><Input type="search" value={value.q} onChange={set("q")} placeholder="Name contains…" /></Field></div>}
      <Field label="Location / zone"><Select value={value.zone} onChange={set("zone")} placeholder="All zones" options={(meta?.zones ?? []).map((z) => [z, z])} /></Field>
      <Field label="Lighting category">
        <Select value={value.classification} onChange={set("classification")} placeholder="All categories"
          options={[...Object.entries(CLASS_META).map(([k, v]) => [k, v.label] as [string, string]), ["verified_issue", "Verified lighting issues"]]} />
      </Field>
      <Field label="Severity"><Select value={value.priority} onChange={set("priority")} placeholder="Any priority" options={[["high", "High"], ["medium", "Medium"], ["low", "Low"]]} /></Field>
      <Field label="Verification"><Select value={value.verification} onChange={set("verification")} placeholder="Any status" options={Object.entries(VERIFY_LABEL)} /></Field>
      <Field label="Data source"><Select value={value.origin} onChange={set("origin")} placeholder="All sources" options={Object.entries(ORIGIN_LABEL).filter(([k]) => k !== "satellite")} /></Field>
      <Field label="From"><Input type="date" value={value.date_from} onChange={set("date_from")} max={value.date_to || undefined} /></Field>
      <Field label="To"><Input type="date" value={value.date_to} onChange={set("date_to")} min={value.date_from || undefined} /></Field>
      <div className="flex items-end">
        <Button type="button" variant="outline" disabled={!dirty} onClick={() => onChange(EMPTY_FILTERS)} className="w-full"><RotateCcw className="size-4" aria-hidden />Reset</Button>
      </div>
    </form>
  );
}
