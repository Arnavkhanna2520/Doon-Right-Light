import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, ErrorBox, Field, Input, Note, PageHeader } from "../components/ui";
import { download } from "../lib/api";
import { fmtNum } from "../lib/format";
import { SignInPrompt } from "../components/SignInPrompt";
import { can, useApp, usePageMeta } from "../lib/hooks";

const FIELDS: { key: string; label: string; hint: string; min: number; max: number; step: number }[] = [
  { key: "fixtures", label: "Number of lighting fixtures", hint: "Whole number", min: 1, max: 1000000, step: 1 },
  { key: "current_wattage", label: "Current wattage (W)", hint: "Per fixture", min: 1, max: 5000, step: 1 },
  { key: "proposed_wattage", label: "Proposed wattage (W)", hint: "Per fixture", min: 0, max: 5000, step: 1 },
  { key: "hours_per_day", label: "Operating hours per day", hint: "1 to 24", min: 0.5, max: 24, step: 0.5 },
  { key: "days", label: "Number of operating days", hint: "For example 365", min: 1, max: 3660, step: 1 },
  { key: "tariff", label: "Electricity tariff (₹ per kWh)", hint: "Enter the tariff on your own bill", min: 0, max: 1000, step: 0.01 },
];

export default function Calculator() {
  usePageMeta("Energy savings calculator", "Estimate energy and cost savings from changing streetlight wattage, using your own assumptions.");
  const { user, authReady } = useApp();
  const [v, setV] = useState<Record<string, string>>({ fixtures: "100", current_wattage: "120", proposed_wattage: "90", hours_per_day: "11", days: "365", tariff: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    for (const f of FIELDS) {
      const n = Number(v[f.key]);
      if (v[f.key] === "" && f.key !== "tariff") e[f.key] = "Required.";
      else if (Number.isNaN(n) || n < f.min || n > f.max) e[f.key] = `Enter a value from ${f.min} to ${fmtNum(f.max)}.`;
      else if (f.key === "fixtures" && !Number.isInteger(n)) e[f.key] = "Enter a whole number.";
      else if (f.key === "days" && !Number.isInteger(n)) e[f.key] = "Enter a whole number.";
    }
    return e;
  }, [v]);
  const ok = Object.keys(errors).length === 0;
  const n = (k: string) => Number(v[k] || 0);
  // Energy (kWh) = Power (kW) x operating hours
  const hours = n("hours_per_day") * n("days");
  const cur = (n("fixtures") * n("current_wattage") / 1000) * hours;
  const pro = (n("fixtures") * n("proposed_wattage") / 1000) * hours;
  const saved = cur - pro;
  const pct = cur ? (saved / cur) * 100 : 0;
  const hasTariff = v.tariff !== "";
  async function pdf() {
    setBusy(true); setErr("");
    try {
      await download("/energy/estimate.pdf", {}, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtures: n("fixtures"), current_wattage: n("current_wattage"), proposed_wattage: n("proposed_wattage"), hours_per_day: n("hours_per_day"), days: n("days"), tariff: n("tariff") }) });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const Row = ({ label, a, b, c, strong }: { label: string; a: string; b: string; c: string; strong?: boolean }) => (
    <tr className={strong ? "font-semibold" : ""}><th scope="row" className="py-2 pr-3 text-left font-medium text-muted">{label}</th><td className="tabular py-2 pr-3 text-right">{a}</td><td className="tabular py-2 pr-3 text-right">{b}</td><td className="tabular py-2 text-right text-ok">{c}</td></tr>
  );
  if (!authReady) return null;
  if (!can(user, "auditor", "moderator")) return <><PageHeader title="Energy savings calculator" /><SignInPrompt what="The energy calculator is for staff. Sign in to use it." roles="staff" /></>;
  return (
    <>
      <PageHeader help="calculator" title="Energy savings calculator" lead="Compare current and proposed fixture wattage. Results update as you type and are estimates based only on the numbers you enter." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card title="Your assumptions">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()} noValidate>
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint} error={errors[f.key]} required={f.key !== "tariff"}>
                <Input type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step} value={v[f.key]} aria-invalid={!!errors[f.key]}
                  onChange={(e) => setV({ ...v, [f.key]: e.target.value })} placeholder={f.key === "tariff" ? "Optional" : undefined} />
              </Field>
            ))}
          </form>
          <p className="mt-4 text-xs text-muted">Formula: energy (kWh) = fixtures × wattage (kW) × hours per day × days. Cost = energy × tariff.</p>
        </Card>
        <Card title="Estimated result" actions={<Button variant="outline" disabled={!ok} busy={busy} onClick={pdf}><Download className="size-4" aria-hidden />PDF</Button>}>
          {err && <div className="mb-3"><ErrorBox message={err} /></div>}
          {!ok ? <p className="text-sm text-muted">Correct the highlighted fields to see the estimate.</p> : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-raised p-4"><p className="text-xs text-muted">Estimated energy saved</p><p className="tabular mt-1 text-2xl font-semibold text-ok">{fmtNum(saved, 0)} kWh</p></div>
                <div className="rounded-lg bg-raised p-4"><p className="text-xs text-muted">Reduction</p><p className="tabular mt-1 text-2xl font-semibold text-ok">{fmtNum(pct, 1)}%</p></div>
              </div>
              <table className="mt-4 w-full text-sm">
                <thead><tr className="text-xs uppercase tracking-wide text-muted"><td /><th scope="col" className="pb-1 pr-3 text-right font-semibold">Current</th><th scope="col" className="pb-1 pr-3 text-right font-semibold">Proposed</th><th scope="col" className="pb-1 text-right font-semibold">Saving</th></tr></thead>
                <tbody className="divide-y divide-line">
                  <Row label="Energy (kWh)" a={fmtNum(cur, 0)} b={fmtNum(pro, 0)} c={fmtNum(saved, 0)} strong />
                  {hasTariff && <Row label="Cost (₹)" a={fmtNum(cur * n("tariff"), 0)} b={fmtNum(pro * n("tariff"), 0)} c={fmtNum(saved * n("tariff"), 0)} strong />}
                </tbody>
              </table>
              {!hasTariff && <p className="mt-2 text-xs text-muted">Enter a tariff to see the cost estimate.</p>}
              {saved < 0 && <p className="mt-2 text-sm text-danger">The proposed wattage is higher than the current one, so consumption would rise.</p>}
            </>
          )}
          <div className="mt-4"><Note tone="warn"><strong>Estimate only.</strong> It ignores driver losses, dimming profiles, outages and tariff slabs. Lower wattage is not automatically appropriate: light levels must stay within the applicable road-lighting standard, and nothing should be reduced at junctions, crossings, hospitals or bus stops without an on-site safety assessment.</Note></div>
        </Card>
      </div>
    </>
  );
}
