import { CheckCircle2, Download, FileUp, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, Button, Card, ClassLabel, ErrorBox, Field, Input, Note, PageHeader, Select, Table, Td } from "../components/ui";
import { download, send } from "../lib/api";
import { fmtDate, human } from "../lib/format";
import { can, useApi, useApp, usePageMeta } from "../lib/hooks";

const COLS: [string, string, boolean][] = [
  ["location", "Name of the measuring point", true], ["latitude / longitude", "Decimal degrees (WGS84)", true],
  ["road_type", "arterial, sub_arterial, collector, residential, pedestrian, junction, other", true],
  ["measured_at", "Date and time, e.g. 2026-01-15 21:30", true], ["lux", "Illuminance at the road surface", false],
  ["fixture_status", "working, non_functional, flickering, obstructed", false], ["fixture_wattage", "Nameplate watts", false],
  ["shielding", "full, partial, none", false], ["light_direction", "downward, sideways, upward", false],
  ["pedestrian_activity / vehicle_activity", "low, medium, high", false], ["safety_critical", "yes / no (junction, crossing, hospital, bus stop…)", false],
  ["zone, weather, safety_context, notes", "Free text", false],
];

export default function Audit() {
  usePageMeta("Ground-level lighting audit", "Upload, validate and classify lux-meter survey data for Dehradun streets.");
  const { user, authReady, reloadMeta } = useApp();
  const allowed = can(user, "auditor");
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [origin, setOrigin] = useState("ground_measured");
  const [source, setSource] = useState("");
  const [collected, setCollected] = useState("");
  const [ds, setDs] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [imported, setImported] = useState<any>(null);
  const thresholds = useApi("/thresholds");
  const history = useApi(can(user, "auditor", "moderator") ? "/datasets" : null, {}, [imported, ds]);

  async function validate(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError("Choose a CSV file first."); return; }
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Only .csv files are accepted."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("The file is larger than 5 MB. Split it into smaller files."); return; }
    setBusy("validate"); setError(""); setDs(null); setImported(null);
    const fd = new FormData();
    fd.append("file", file); fd.append("data_origin", origin); fd.append("source_note", source); fd.append("collected_on", collected);
    try { setDs(await send("POST", "/datasets/validate", fd)); } catch (e: any) { setError(e.message); } finally { setBusy(""); }
  }
  async function doImport() {
    setBusy("import"); setError("");
    try { setImported(await send("POST", `/datasets/${ds.id}/import`)); reloadMeta(); } catch (e: any) { setError(e.message); } finally { setBusy(""); }
  }
  async function dl(path: string) { setError(""); try { await download(path); } catch (e: any) { setError(e.message); } }
  const s = ds?.report?.summary;

  return (
    <>
      <PageHeader help="audit" title="Ground-level lighting audit" lead="Upload a lux-meter survey as CSV. The file is checked for missing values, duplicates, wrong data types and inconsistent entries before anything is imported."
        actions={<Button variant="outline" onClick={() => dl("/datasets/template.csv")}><Download className="size-4" aria-hidden />CSV template</Button>} />
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          {error && <ErrorBox message={error} />}
          {!authReady ? null : !allowed ? <SignInPrompt what="Uploading survey data needs an auditor account." roles="auditors and administrators" /> : (
            <Card title="1. Upload and validate">
              <form onSubmit={validate} className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Survey file (.csv, up to 5 MB)" required>
                    <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(""); }}
                      className="block w-full cursor-pointer rounded-lg border border-dashed border-line bg-raised p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-ink" />
                  </Field>
                </div>
                <Field label="Data origin" hint="How these readings were obtained"><Select value={origin} onChange={(e) => setOrigin(e.target.value)} options={[["ground_measured", "Measured by our survey team"], ["imported", "Imported from another source"]]} /></Field>
                <Field label="Collection date(s)" hint="Shown with the dataset"><Input value={collected} onChange={(e) => setCollected(e.target.value)} placeholder="e.g. 10–12 Jan 2026" maxLength={40} /></Field>
                <div className="sm:col-span-2"><Field label="Source and method note" hint="Instrument, measuring height, who collected it"><Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={500} placeholder="e.g. Handheld lux meter at 1 m, sensor horizontal, team of two" /></Field></div>
                <div className="sm:col-span-2"><Button type="submit" busy={busy === "validate"}><Upload className="size-4" aria-hidden />Validate file</Button></div>
              </form>
            </Card>
          )}

          {ds && (
            <Card title="2. Validation result" hint={ds.filename}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[["Rows read", s.total_rows], ["Valid", s.valid_rows], ["Rejected", s.rejected_rows], ["Duplicates removed", s.duplicate_rows], ["Warnings", s.warning_count]].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-raised p-3"><p className="text-xs text-muted">{l}</p><p className="tabular text-xl font-semibold">{v}</p></div>
                ))}
              </div>
              {Object.values(s.missing_values as Record<string, number>).some((n) => n > 0) && (
                <p className="mt-3 text-sm text-muted"><strong className="text-ink">Missing optional values:</strong> {Object.entries(s.missing_values as Record<string, number>).filter(([, n]) => n > 0).map(([c, n]) => `${c} (${n})`).join(", ")}</p>
              )}
              {ds.report.issues.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-2 text-sm font-semibold">Issues found</h3>
                  <div className="max-h-72 overflow-y-auto">
                    <Table head={["Row", "Column", "Severity", "Problem"]}>
                      {ds.report.issues.map((i: any, n: number) => (
                        <tr key={n}><Td className="tabular">{i.row ?? "File"}</Td><Td>{i.column}</Td><Td><Badge tone={i.severity === "error" ? "danger" : "warn"}>{i.severity}</Badge></Td><Td>{i.message}</Td></tr>
                      ))}
                    </Table>
                  </div>
                  {ds.report.issues_truncated && <p className="mt-1 text-xs text-muted">Only the first 500 issues are shown.</p>}
                </div>
              )}
              {ds.report.preview.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-2 text-sm font-semibold">Preview of cleaned data (first {ds.report.preview.length} rows)</h3>
                  <Table head={["Location", "Lat", "Lon", "Road", "Measured", "Lux", "Fixture", "W", "Shielding", "Direction"]}>
                    {ds.report.preview.map((r: any, n: number) => (
                      <tr key={n}><Td className="font-medium">{r.location}</Td><Td className="tabular">{r.latitude}</Td><Td className="tabular">{r.longitude}</Td><Td>{human(r.road_type)}</Td><Td className="whitespace-nowrap">{r.measured_at.slice(0, 16)}</Td>
                        <Td className="tabular">{r.lux ?? "–"}</Td><Td>{human(r.fixture_status)}</Td><Td className="tabular">{r.fixture_wattage ?? "–"}</Td><Td>{r.shielding}</Td><Td>{r.light_direction}</Td></tr>
                    ))}
                  </Table>
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => dl(`/datasets/${ds.id}/cleaned.csv`)} disabled={!s.can_import}><Download className="size-4" aria-hidden />Download cleaned data</Button>
                {!imported && <Button onClick={doImport} busy={busy === "import"} disabled={!s.can_import}><FileUp className="size-4" aria-hidden />Import {s.valid_rows} valid rows</Button>}
                {!s.can_import && <span className="text-sm text-danger">Nothing can be imported. Fix the errors and upload again.</span>}
              </div>
              {imported && (
                <div className="mt-4"><Note><span className="flex items-center gap-2 font-medium text-ok"><CheckCircle2 className="size-4" aria-hidden />Imported {imported.imported_observations} observations at {imported.new_locations} new locations.</span>
                  They are marked <strong>unverified</strong> until an auditor confirms them in the <Link className="underline" to="/admin">admin panel</Link>. <Link className="underline" to="/map">View on the map</Link>.</Note></div>
              )}
            </Card>
          )}

          {history.data?.items?.length > 0 && (
            <Card title="Uploaded datasets">
              <Table head={["File", "Origin", "Status", "Valid / rows", "Uploaded", ""]}>
                {history.data.items.map((d: any) => (
                  <tr key={d.id}><Td className="font-medium">{d.filename}<span className="block text-xs text-muted">{d.source_note}</span></Td><Td>{human(d.data_origin)}</Td>
                    <Td><Badge tone={d.status === "imported" ? "ok" : "neutral"}>{d.status}</Badge></Td><Td className="tabular">{d.valid_count} / {d.row_count}</Td><Td className="whitespace-nowrap">{fmtDate(d.created_at)}</Td>
                    <Td><button className="text-info underline" onClick={() => dl(`/datasets/${d.id}/cleaned.csv`)}>Cleaned CSV</button></Td></tr>
                ))}
              </Table>
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card title="How readings are classified">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
              <li>Fixture recorded as not working → <ClassLabel k="non_functional" /></li>
              <li>No lux reading, or no range configured for the road type → <ClassLabel k="needs_investigation" /></li>
              <li>Lux below the range → <ClassLabel k="insufficient" /></li>
              <li>Lux above the range → <ClassLabel k="potential_excessive" /></li>
              <li>Otherwise → <ClassLabel k="adequate" /></li>
            </ol>
            <h3 className="mb-2 mt-5 text-sm font-semibold">Ranges currently in force</h3>
            {thresholds.data?.items.length === 0 ? (
              <Note tone="warn">No ranges are configured, so every measured location is marked “requires investigation”. This platform does not invent official lux limits. An administrator must enter values from the applicable standard and record the source.</Note>
            ) : (
              <ul className="space-y-2 text-sm">
                {thresholds.data?.items.map((t: any) => (
                  <li key={t.road_type} className="rounded-lg bg-raised p-2.5">
                    <span className="flex items-center justify-between gap-2"><strong>{human(t.road_type)}</strong><span className="tabular">{t.min_lux}–{t.max_lux} lux</span></span>
                    <span className="mt-1 block text-xs text-muted">{t.basis === "demo_placeholder" ? <Badge tone="demo">Demo value</Badge> : <Badge tone="ok">{human(t.basis)}</Badge>} {t.source_note}</span>
                  </li>
                ))}
              </ul>
            )}
            {thresholds.data?.unconfigured.length > 0 && thresholds.data.items.length > 0 && <p className="mt-2 text-xs text-muted">Not configured: {thresholds.data.unconfigured.map(human).join(", ")}.</p>}
          </Card>
          <Card title="CSV columns">
            <ul className="space-y-2 text-sm">
              {COLS.map(([c, d, req]) => <li key={c}><code className="rounded bg-raised px-1.5 py-0.5 text-xs">{c}</code> {req && <span className="text-xs font-semibold text-danger">required</span>}<span className="block text-xs text-muted">{d}</span></li>)}
            </ul>
            <p className="mt-3 text-xs text-muted">Common header variants such as “Lux Measurement”, “Date Time” or “Lighting Direction” are recognised automatically.</p>
          </Card>
        </aside>
      </div>
    </>
  );
}
