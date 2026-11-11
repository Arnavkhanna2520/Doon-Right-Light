import { FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Filters } from "../components/Filters";
import { SignInPrompt } from "../components/SignInPrompt";
import { Button, Card, ErrorBox, Note, PageHeader } from "../components/ui";
import { EMPTY_FILTERS, download, type FilterState } from "../lib/api";
import { can, useApp, usePageMeta } from "../lib/hooks";

const SECTIONS: [string, string][] = [["overview", "Overview and thresholds"], ["locations", "Location-wise lighting audit"], ["hotspots", "Hotspot analysis"], ["complaints", "Citizen report summary"], ["recommendations", "Recommendations"]];

export default function Downloads() {
  usePageMeta("Reports and downloads", "Download CSV and PDF reports of lighting audits, hotspots, citizen reports and recommendations.");
  const { user, authReady } = useApp();
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sections, setSections] = useState<string[]>(SECTIONS.map(([k]) => k));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function dl(key: string, path: string, params: Record<string, unknown> = {}) {
    setBusy(key); setError("");
    try { await download(path, params); } catch (e: any) { setError(e.message); } finally { setBusy(""); }
  }
  const staff = can(user, "auditor", "moderator");
  const csvs: { key: string; title: string; text: string; path: string; filtered: boolean; roles: string[] }[] = [
    { key: "obs", title: "Lighting observations", text: "Latest observation per location with classification, provenance and priority.", path: "/exports/observations.csv", filtered: true, roles: ["auditor", "moderator"] },
    { key: "hot", title: "Hotspot analysis", text: "Getis-Ord Gi* z-score and result for every location with a lux reading (500 m band).", path: "/exports/hotspots.csv", filtered: true, roles: ["auditor", "moderator"] },
    { key: "rec", title: "Recommendations", text: "All suggested actions with rationale, priority and evidence level.", path: "/exports/recommendations.csv", filtered: false, roles: ["auditor", "moderator"] },
    { key: "rep", title: "Citizen report summary", text: "Every report with category, status and location. Contact details are never exported.", path: "/exports/citizen-reports.csv", filtered: false, roles: ["moderator"] },
  ];
  return (
    <>
      <PageHeader help="downloads" title="Reports and downloads" lead="Export what the platform holds as CSV for analysis or as a PDF report. Every export states its period, data sources, method and limitations." />
      {!authReady ? null : !staff ? (
        <div className="space-y-6">
          <SignInPrompt what="Data exports are limited to project staff, because they can contain unverified records and report text." roles="auditors, moderators and administrators" />
          <Note>Anyone can download an energy estimate as PDF from the <Link className="underline" to="/calculator">energy calculator</Link>, and the survey <a className="underline" href="/api/datasets/template.csv">CSV template</a>.</Note>
        </div>
      ) : (
        <div className="space-y-6">
          {error && <ErrorBox message={error} />}
          <div><h2 className="mb-2 text-sm font-semibold">Reporting period and filters</h2><Filters value={filters} onChange={setFilters} /></div>
          <Card title="PDF report" hint="Choose the sections to include. The filters above set the reporting period and scope.">
            <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <legend className="sr-only">Sections</legend>
              {SECTIONS.map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 rounded-lg border border-line p-3 text-sm">
                  <input type="checkbox" className="size-4" checked={sections.includes(k)} onChange={(e) => setSections(e.target.checked ? [...sections, k] : sections.filter((s) => s !== k))} />{label}
                </label>
              ))}
            </fieldset>
            <div className="mt-4"><Button busy={busy === "pdf"} disabled={sections.length === 0} onClick={() => dl("pdf", "/exports/report.pdf", { ...filters, sections: sections.join(",") })}><FileText className="size-4" aria-hidden />Download PDF report</Button></div>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            {csvs.filter((c) => can(user, ...c.roles)).map((c) => (
              <Card key={c.key} title={c.title} hint={c.text}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted">{c.filtered ? "Uses the filters above" : "All records"}</span>
                  <Button variant="outline" busy={busy === c.key} onClick={() => dl(c.key, c.path, c.filtered ? { ...filters } : {})}><FileSpreadsheet className="size-4" aria-hidden />Download CSV</Button>
                </div>
              </Card>
            ))}
          </div>
          <Note tone="warn">Exports include demo records when demo data is loaded; they are marked <code>data_origin=demo</code> in CSV files and called out at the top of the PDF. Set Data source to exclude them before sharing a report.</Note>
        </div>
      )}
    </>
  );
}
