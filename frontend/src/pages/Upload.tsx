import { CheckCircle2, Download, FileUp, Upload as UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, Button, Card, ClassLabel, ErrorBox, Field, Input, Note, PageHeader, Select, Table, Td } from "../components/ui";
import { download, send } from "../lib/api";
import { human } from "../lib/format";
import { can, useApp, usePageMeta } from "../lib/hooks";

const COLS: [string, string, boolean][] = [
  ["location", "Name of the measuring point", true], ["latitude / longitude", "Decimal degrees (WGS84)", true],
  ["road_type", "arterial, sub_arterial, collector, residential, pedestrian, junction, other", true],
  ["measured_at", "Date and time, e.g. 2026-01-15 21:30", true], ["lux", "Illuminance at the road surface", false],
  ["fixture_status", "working, non_functional, flickering, obstructed", false], ["fixture_wattage", "Nameplate watts", false],
  ["shielding", "full, partial, none", false], ["light_direction", "downward, sideways, upward", false],
  ["pedestrian_activity / vehicle_activity", "low, medium, high", false], ["safety_critical", "yes / no (junction, crossing, hospital, bus stop…)", false],
  ["zone, weather, safety_context, notes", "Free text", false],
];

export default function Upload() {
  usePageMeta("Upload survey data", "Upload, check and import lux-meter survey data from an Excel or CSV file.");
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

  async function validate(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError("Choose an Excel or CSV file first."); return; }
    if (!/\.(csv|xlsx)$/i.test(file.name)) { setError("Only .xlsx (Excel) or .csv files are accepted."); return; }
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
      <PageHeader help="upload" title="Upload survey data" lead="Upload your lux-meter readings as an Excel or CSV file. The site checks every row before anything is saved, then shows the readings on the map and dashboard."
        actions={<><Button variant="outline" onClick={() => dl("/datasets/template.xlsx")}><Download className="size-4" aria-hidden />Excel template</Button><Button variant="outline" onClick={() => dl("/datasets/template.csv")}><Download className="size-4" aria-hidden />CSV template</Button></>} />
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          {error && <ErrorBox message={error} />}
          {!authReady ? null : !allowed ? <SignInPrompt what="Uploading survey data needs a staff account." roles="auditors and administrators" /> : (
            <Card title="1. Upload and validate">
              <form onSubmit={validate} className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Survey file (.xlsx or .csv, up to 5 MB)" required>
                    <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(""); }}
                      className="block w-full cursor-pointer rounded-lg border border-dashed border-line bg-raised p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-ink" />
                  </Field>
                </div>
                <Field label="Data origin" hint="How these readings were obtained"><Select value={origin} onChange={(e) => setOrigin(e.target.value)} options={[["ground_measured", "Measured by our survey team"], ["imported", "Imported from another source"]]} /></Field>
                <Field label="Collection date(s)" hint="Shown with the dataset"><Input value={collected} onChange={(e) => setCollected(e.target.value)} placeholder="e.g. 10–12 Jan 2026" maxLength={40} /></Field>
                <div className="sm:col-span-2"><Field label="Source and method note" hint="Instrument, measuring height, who collected it"><Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={500} placeholder="e.g. Handheld lux meter at 1 m, sensor horizontal, team of two" /></Field></div>
                <div className="sm:col-span-2"><Button type="submit" busy={busy === "validate"}><UploadIcon className="size-4" aria-hidden />Check file</Button></div>
              </form>
            </Card>
          )}

          {ds && (
            <Card title="2. Check result" hint={ds.filename}>
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
                  They are marked <strong>unverified</strong> until someone checks them on site. <Link className="underline" to={`/records?file=${ds.id}`}>See these records</Link> or <Link className="underline" to="/map">view them on the map</Link>.</Note></div>
              )}
            </Card>
          )}

          <p className="text-sm text-muted">Every file you upload is listed on the <Link className="underline" to="/records">Records</Link> page.</p>
        </div>

        <aside className="space-y-6">
          <Card title="How it works">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
              <li>Download the Excel template and fill one row per reading.</li>
              <li>Upload it and press <strong className="text-ink">Check file</strong>. Fix any rows it lists.</li>
              <li>Press <strong className="text-ink">Import</strong>. Each reading is sorted into <ClassLabel k="potential_excessive" />, <ClassLabel k="adequate" />, <ClassLabel k="insufficient" />, <ClassLabel k="non_functional" /> or <ClassLabel k="needs_investigation" />.</li>
            </ol>
            <p className="mt-3 text-xs text-muted">The lux range for each road type is set by an administrator in <Link className="underline" to="/admin">Admin → Thresholds</Link>.</p>
          </Card>
          <Card title="Columns in the file">
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
