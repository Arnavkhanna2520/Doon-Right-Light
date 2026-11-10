import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, Button, Card, ClassLabel, Empty, ErrorBox, Field, Input, Note, PageHeader, Pagination, ProvenanceBadge, Select, Spinner, Table, Td, cx, inputCls } from "../components/ui";
import { send } from "../lib/api";
import { REPORT_CATEGORY, REPORT_STATUS, fmtDate, human } from "../lib/format";
import { can, useApi, useApp, usePageMeta } from "../lib/hooks";

function useAction() {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  async function run(key: string, fn: () => Promise<unknown>, success = "Saved.") {
    setBusy(key); setError(""); setOk("");
    try { await fn(); setOk(success); return true; } catch (e: any) { setError(e.message); return false; } finally { setBusy(""); }
  }
  const feedback = <>{error && <div className="mb-3"><ErrorBox message={error} /></div>}{ok && <p role="status" className="mb-3 rounded-lg border border-ok/40 bg-ok/10 p-2.5 text-sm text-ok">{ok}</p>}</>;
  return { busy, run, feedback };
}

// ------------------------------------------------------------------ reports
function Photo({ id }: { id: number }) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    let u = "";
    fetch(`/api/admin/reports/${id}/photo`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("Photo could not be loaded."))))
      .then((b) => { u = URL.createObjectURL(b); setUrl(u); }).catch((e) => setErr(e.message));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  if (err) return <p className="text-sm text-danger">{err}</p>;
  return url ? <img src={url} alt="Photograph attached to the citizen report" className="max-h-64 rounded-lg border border-line" /> : <p className="text-sm text-muted">Loading photo…</p>;
}

function ReportReview({ r, onSaved }: { r: any; onSaved: () => void }) {
  const [status, setStatus] = useState(r.status);
  const [publicNote, setPublicNote] = useState(r.public_note);
  const [adminNote, setAdminNote] = useState(r.admin_note);
  const { busy, run, feedback } = useAction();
  return (
    <div className="grid gap-4 bg-raised/50 p-4 md:grid-cols-2">
      <div className="space-y-2 text-sm">
        <p>{r.description}</p>
        <p className="text-muted">Location: {r.location_text || "not described"}{r.latitude !== null && <> · <span className="tabular">{r.latitude}, {r.longitude}</span></>}</p>
        <p className="text-muted">Contact: {r.contact_name || r.contact_info ? `${r.contact_name} ${r.contact_info}` : "none given"}</p>
        {r.duplicate_of_id && <p><Badge tone="warn">Possible duplicate</Badge> <span className="text-muted">of report #{r.duplicate_of_id}</span></p>}
        {r.has_photo && <Photo id={r.id} />}
      </div>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run("save", () => send("PATCH", `/admin/reports/${r.id}`, { status, public_note: publicNote, admin_note: adminNote })).then((ok) => ok && onSaved()); }}>
        {feedback}
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={Object.entries(REPORT_STATUS)} /></Field>
        <Field label="Note shown to the reporter" hint="Visible to anyone with the report ID. Do not include personal details."><textarea className={inputCls} rows={2} maxLength={500} value={publicNote} onChange={(e) => setPublicNote(e.target.value)} /></Field>
        <Field label="Internal note"><textarea className={inputCls} rows={2} maxLength={2000} value={adminNote} onChange={(e) => setAdminNote(e.target.value)} /></Field>
        <Button type="submit" busy={busy === "save"}>Save review</Button>
      </form>
    </div>
  );
}

function Reports() {
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const { data, error, loading, reload } = useApi("/admin/reports", { status, category, q, page, page_size: 15 });
  return (
    <Card title="Citizen reports" hint="Reports stay unverified and off the public map until you mark them Verified, In progress or Resolved.">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Status"><Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={Object.entries(REPORT_STATUS)} /></Field>
        <Field label="Category"><Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} placeholder="All categories" options={Object.entries(REPORT_CATEGORY)} /></Field>
        <Field label="Search"><Input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="ID, text or location" /></Field>
      </div>
      {error && <ErrorBox message={error} retry={reload} />}
      {loading && !data && <Spinner />}
      {data?.items.length === 0 && <Empty title="No reports match" />}
      {data?.items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line">
          <ul className="divide-y divide-line">
            {data.items.map((r: any) => (
              <li key={r.id}>
                <button className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left text-sm hover:bg-raised" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <span className="tabular font-semibold">{r.public_id}</span>
                  <span className="flex-1 truncate">{REPORT_CATEGORY[r.category]}</span>
                  {r.is_demo && <Badge tone="demo">Demo</Badge>}
                  <Badge tone={r.status === "submitted" ? "warn" : r.status === "rejected" ? "danger" : r.status === "resolved" ? "ok" : "info"}>{REPORT_STATUS[r.status]}</Badge>
                  <span className="text-xs text-muted">{fmtDate(r.created_at)}</span>
                </button>
                {open === r.id && <ReportReview r={r} onSaved={reload} />}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data && <Pagination page={page} pageSize={15} total={data.total} onPage={setPage} />}
    </Card>
  );
}

// ------------------------------------------------------------- observations
function Observations() {
  const { user, reloadMeta } = useApp();
  const editable = can(user, "auditor");
  const [verification, setVerification] = useState("");
  const [classification, setClassification] = useState("");
  const [origin, setOrigin] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi("/admin/observations", { verification, classification, origin, q, page, page_size: 15 });
  const { busy, run, feedback } = useAction();
  const act = (key: string, fn: () => Promise<unknown>, msg: string) => run(key, fn, msg).then((ok) => { if (ok) { reload(); reloadMeta(); } });
  return (
    <Card title="Lighting observations" hint="Verify a reading once it has been checked on site. Only verified readings produce recommendations to change lighting.">
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Field label="Verification"><Select value={verification} onChange={(e) => { setVerification(e.target.value); setPage(1); }} placeholder="Any" options={[["unverified", "Unverified"], ["verified", "Verified"], ["expert_verified", "Expert verified"]]} /></Field>
        <Field label="Classification"><Select value={classification} onChange={(e) => { setClassification(e.target.value); setPage(1); }} placeholder="Any" options={[["potential_excessive", "Excessive"], ["insufficient", "Insufficient"], ["non_functional", "Non-functional"], ["adequate", "Adequate"], ["needs_investigation", "Requires investigation"]]} /></Field>
        <Field label="Source"><Select value={origin} onChange={(e) => { setOrigin(e.target.value); setPage(1); }} placeholder="Any" options={[["ground_measured", "Ground measured"], ["imported", "Imported"], ["demo", "Demo"]]} /></Field>
        <Field label="Location"><Input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name contains…" /></Field>
      </div>
      {feedback}
      {error && <ErrorBox message={error} retry={reload} />}
      {loading && !data && <Spinner />}
      {data?.items.length === 0 && <Empty title="No observations match" />}
      {data?.items.length > 0 && (
        <Table head={["Location", "Measured", "Lux", "Classification", "Provenance", "Actions"]}>
          {data.items.map((o: any) => (
            <tr key={o.id}>
              <Td><span className="font-medium">{o.location.name}</span><span className="block text-xs text-muted">{human(o.location.road_type)}{o.location.safety_critical && " · safety-critical"}</span></Td>
              <Td className="whitespace-nowrap">{fmtDate(o.measured_at)}</Td><Td className="tabular">{o.lux ?? "–"}</Td>
              <Td><ClassLabel k={o.classification} /><span className="block max-w-xs text-xs text-muted">{o.classification_basis}</span></Td>
              <Td><span className="flex flex-wrap gap-1"><ProvenanceBadge origin={o.data_origin} verification={o.verification_status} /></span></Td>
              <Td>
                {editable && (
                  <span className="flex flex-wrap gap-1.5">
                    {o.data_origin !== "demo" && (o.verification_status === "unverified"
                      ? <><Button small variant="outline" busy={busy === `v${o.id}`} onClick={() => act(`v${o.id}`, () => send("PATCH", `/admin/observations/${o.id}`, { verification_status: "verified" }), "Marked as verified.")}>Verify</Button>
                        <Button small variant="outline" busy={busy === `e${o.id}`} onClick={() => act(`e${o.id}`, () => send("PATCH", `/admin/observations/${o.id}`, { verification_status: "expert_verified" }), "Marked as expert verified.")}>Expert</Button></>
                      : <Button small variant="outline" busy={busy === `u${o.id}`} onClick={() => act(`u${o.id}`, () => send("PATCH", `/admin/observations/${o.id}`, { verification_status: "unverified" }), "Verification removed.")}>Unverify</Button>)}
                    <Button small variant="outline" busy={busy === `s${o.id}`} title="Toggle the safety-critical flag for this location"
                      onClick={() => act(`s${o.id}`, () => send("PATCH", `/admin/locations/${o.location.id}`, { safety_critical: !o.location.safety_critical }), "Safety flag updated.")}>{o.location.safety_critical ? "Unflag safety" : "Flag safety"}</Button>
                    <Button small variant="ghost" aria-label={`Delete observation at ${o.location.name}`} busy={busy === `d${o.id}`}
                      onClick={() => { if (window.confirm(`Delete this observation at ${o.location.name}? This cannot be undone.`)) act(`d${o.id}`, () => send("DELETE", `/admin/observations/${o.id}`), "Observation deleted."); }}><Trash2 className="size-4 text-danger" /></Button>
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {data && <Pagination page={page} pageSize={15} total={data.total} onPage={setPage} />}
    </Card>
  );
}

// ---------------------------------------------------------------- locations
const BLANK = { name: "", latitude: "", longitude: "", zone: "", road_type: "residential", lux: "", fixture_status: "working", fixture_wattage: "", shielding: "unknown", light_direction: "unknown", pedestrian_activity: "unknown", vehicle_activity: "unknown", safety_context: "", notes: "" };
function AddLocation() {
  const { meta, reloadMeta } = useApp();
  const [f, setF] = useState(BLANK);
  const [critical, setCritical] = useState(false);
  const { busy, run, feedback } = useAction();
  const set = (k: keyof typeof BLANK) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const opt = (k: string) => (meta?.enums[k] ?? []).map((v: string) => [v, human(v)] as [string, string]);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: any = { ...f, latitude: Number(f.latitude), longitude: Number(f.longitude), safety_critical: critical,
      lux: f.lux === "" ? null : Number(f.lux), fixture_wattage: f.fixture_wattage === "" ? null : Number(f.fixture_wattage) };
    run("add", () => send("POST", "/admin/locations", body), "Location and observation added as unverified ground data.").then((ok) => { if (ok) { setF(BLANK); setCritical(false); reloadMeta(); } });
  }
  return (
    <Card title="Add a location and observation" hint="For single readings. Use the Lighting audit page to upload a whole survey.">
      {feedback}
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2"><Field label="Location name" required><Input required minLength={2} maxLength={200} value={f.name} onChange={set("name")} /></Field></div>
        <Field label="Latitude" required><Input required type="number" step="any" min={-90} max={90} value={f.latitude} onChange={set("latitude")} placeholder="30.3165" /></Field>
        <Field label="Longitude" required><Input required type="number" step="any" min={-180} max={180} value={f.longitude} onChange={set("longitude")} placeholder="78.0322" /></Field>
        <Field label="Zone"><Input maxLength={120} value={f.zone} onChange={set("zone")} /></Field>
        <Field label="Road type"><Select value={f.road_type} onChange={set("road_type")} options={opt("road_types")} /></Field>
        <Field label="Lux"><Input type="number" step="any" min={0} value={f.lux} onChange={set("lux")} /></Field>
        <Field label="Fixture wattage (W)"><Input type="number" step="any" min={1} max={2000} value={f.fixture_wattage} onChange={set("fixture_wattage")} /></Field>
        <Field label="Fixture status"><Select value={f.fixture_status} onChange={set("fixture_status")} options={opt("fixture_status")} /></Field>
        <Field label="Shielding"><Select value={f.shielding} onChange={set("shielding")} options={opt("shielding")} /></Field>
        <Field label="Light direction"><Select value={f.light_direction} onChange={set("light_direction")} options={opt("direction")} /></Field>
        <Field label="Pedestrian activity"><Select value={f.pedestrian_activity} onChange={set("pedestrian_activity")} options={opt("activity")} /></Field>
        <Field label="Vehicle activity"><Select value={f.vehicle_activity} onChange={set("vehicle_activity")} options={opt("activity")} /></Field>
        <div className="sm:col-span-2"><Field label="Notes"><Input maxLength={2000} value={f.notes} onChange={set("notes")} /></Field></div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="size-4" checked={critical} onChange={(e) => setCritical(e.target.checked)} />Safety-critical location</label>
        <div className="sm:col-span-2"><Field label="Safety context" hint="e.g. pedestrian crossing, hospital gate"><Input maxLength={200} value={f.safety_context} onChange={set("safety_context")} /></Field></div>
        <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" busy={busy === "add"}>Add location</Button></div>
      </form>
    </Card>
  );
}

// --------------------------------------------------------------- thresholds
function Thresholds() {
  const { meta, reloadMeta } = useApp();
  const { data, reload } = useApi("/thresholds");
  const [road, setRoad] = useState("residential");
  const [f, setF] = useState({ min_lux: "", max_lux: "", basis: "verified_standard", source_note: "" });
  const { busy, run, feedback } = useAction();
  const done = (ok: boolean) => { if (ok) { reload(); reloadMeta(); } };
  return (
    <Card title="Classification thresholds" hint="The lux range treated as adequate for each road type. Changing a range re-classifies every observation.">
      <div className="mb-4"><Note tone="warn">Enter values only from a source you can cite, such as the applicable edition of IS 1944 or a written municipal policy, and record that source. The platform never fills these in for you.</Note></div>
      {feedback}
      {data?.items.length > 0 && (
        <div className="mb-5">
          <Table head={["Road type", "Range (lux)", "Basis", "Source", ""]}>
            {data.items.map((t: any) => (
              <tr key={t.road_type}><Td className="font-medium">{human(t.road_type)}</Td><Td className="tabular">{t.min_lux} – {t.max_lux}</Td>
                <Td>{t.basis === "demo_placeholder" ? <Badge tone="demo">Demo value</Badge> : <Badge tone="ok">{human(t.basis)}</Badge>}</Td><Td className="max-w-sm text-muted">{t.source_note}</Td>
                <Td><Button small variant="ghost" busy={busy === t.road_type} aria-label={`Remove threshold for ${t.road_type}`} onClick={() => { if (window.confirm(`Remove the ${human(t.road_type)} threshold? Affected observations become "requires investigation".`)) run(t.road_type, () => send("DELETE", `/admin/thresholds/${t.road_type}`), "Threshold removed and observations re-classified.").then(done); }}><Trash2 className="size-4 text-danger" /></Button></Td></tr>
            ))}
          </Table>
        </div>
      )}
      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); run("set", () => send("PUT", `/admin/thresholds/${road}`, { ...f, min_lux: Number(f.min_lux), max_lux: Number(f.max_lux) }), "Threshold saved and observations re-classified.").then(done); }}>
        <Field label="Road type"><Select value={road} onChange={(e) => setRoad(e.target.value)} options={(meta?.enums.road_types ?? []).map((v: string) => [v, human(v)])} /></Field>
        <Field label="Minimum lux" required><Input required type="number" step="any" min={0} value={f.min_lux} onChange={(e) => setF({ ...f, min_lux: e.target.value })} /></Field>
        <Field label="Maximum lux" required><Input required type="number" step="any" min={0} value={f.max_lux} onChange={(e) => setF({ ...f, max_lux: e.target.value })} /></Field>
        <Field label="Basis"><Select value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })} options={[["verified_standard", "Verified standard"], ["local_policy", "Local policy value"]]} /></Field>
        <div className="sm:col-span-2 lg:col-span-4"><Field label="Source" required hint="Document, edition, clause or table, and who checked it"><Input required minLength={5} maxLength={500} value={f.source_note} onChange={(e) => setF({ ...f, source_note: e.target.value })} /></Field></div>
        <div><Button type="submit" busy={busy === "set"}>Save threshold</Button></div>
      </form>
    </Card>
  );
}

// -------------------------------------------------------------------- users
function Users() {
  const { user } = useApp();
  const { data, error, reload } = useApi("/admin/users");
  const [f, setF] = useState({ email: "", full_name: "", password: "", role: "moderator" });
  const { busy, run, feedback } = useAction();
  return (
    <Card title="Staff accounts" hint="Administrators manage everything. Auditors upload and verify measurements. Moderators review citizen reports.">
      {feedback}{error && <ErrorBox message={error} />}
      {data && (
        <Table head={["Email", "Name", "Role", "Status", ""]}>
          {data.items.map((u: any) => (
            <tr key={u.id}><Td className="font-medium">{u.email}</Td><Td>{u.full_name}</Td>
              <Td><select aria-label={`Role for ${u.email}`} className={cx(inputCls, "w-36 py-1")} value={u.role} disabled={u.id === user?.id} onChange={(e) => run(`r${u.id}`, () => send("PATCH", `/admin/users/${u.id}`, { role: e.target.value }), "Role updated.").then((ok) => ok && reload())}>
                {["admin", "auditor", "moderator"].map((r) => <option key={r} value={r}>{human(r)}</option>)}</select></Td>
              <Td>{u.is_active ? <Badge tone="ok">Active</Badge> : <Badge>Disabled</Badge>}</Td>
              <Td>{u.id !== user?.id && <Button small variant="outline" busy={busy === `a${u.id}`} onClick={() => run(`a${u.id}`, () => send("PATCH", `/admin/users/${u.id}`, { is_active: !u.is_active }), u.is_active ? "Account disabled." : "Account enabled.").then((ok) => ok && reload())}>{u.is_active ? "Disable" : "Enable"}</Button>}</Td></tr>
          ))}
        </Table>
      )}
      <h3 className="mb-3 mt-6 text-sm font-semibold">Add a staff account</h3>
      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); run("add", () => send("POST", "/admin/users", f), "Account created.").then((ok) => { if (ok) { setF({ email: "", full_name: "", password: "", role: "moderator" }); reload(); } }); }}>
        <Field label="Email" required><Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="off" /></Field>
        <Field label="Name"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} maxLength={120} /></Field>
        <Field label="Temporary password" required hint="10+ characters with an upper-case letter and a digit"><Input required type="password" minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
        <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={[["moderator", "Moderator"], ["auditor", "Auditor"], ["admin", "Admin"]]} /></Field>
        <div><Button type="submit" busy={busy === "add"}>Create account</Button></div>
      </form>
    </Card>
  );
}

// ----------------------------------------------------------------- activity
function Activity() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi("/admin/audit-logs", { page, page_size: 25 });
  return (
    <Card title="Activity log" hint="Sign-ins, reviews, imports, exports and configuration changes.">
      {error && <ErrorBox message={error} retry={reload} />}{loading && !data && <Spinner />}
      {data?.items.length === 0 && <Empty title="No activity recorded yet" />}
      {data?.items.length > 0 && (
        <Table head={["When", "User", "Action", "Record", "Detail"]}>
          {data.items.map((a: any) => <tr key={a.id}><Td className="whitespace-nowrap">{fmtDate(a.created_at)}</Td><Td>{a.user_email || "–"}</Td><Td><Badge>{human(a.action)}</Badge></Td><Td>{a.entity} {a.entity_id}</Td><Td className="max-w-md break-words text-muted">{a.detail}</Td></tr>)}
        </Table>
      )}
      {data && <Pagination page={page} pageSize={25} total={data.total} onPage={setPage} />}
    </Card>
  );
}

// --------------------------------------------------------------------- data
function DataTools() {
  const { user, meta, reloadMeta } = useApp();
  const { busy, run, feedback } = useAction();
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  return (
    <div className="space-y-6">
      {user?.role === "admin" && (
        <Card title="Demonstration data" hint="Synthetic records for showing how the platform works before real surveys exist.">
          {feedback}
          <p className="mb-4 text-sm text-muted">Demo data consists of 96 synthetic points on a grid with generic names, 14 synthetic citizen reports and illustrative thresholds. Everything is labelled DEMO across the site and cannot be marked as verified. Loading it never overwrites real records or thresholds you entered. Status: <strong className="text-ink">{meta?.has_demo_data ? "loaded" : "not loaded"}</strong>.</p>
          <div className="flex flex-wrap gap-3">
            <Button busy={busy === "seed"} onClick={() => run("seed", () => send("POST", "/admin/demo-data"), "Demo data loaded.").then((ok) => ok && reloadMeta())}>{meta?.has_demo_data ? "Reload demo data" : "Load demo data"}</Button>
            <Button variant="danger" disabled={!meta?.has_demo_data} busy={busy === "purge"} onClick={() => { if (window.confirm("Remove all demo records, demo reports and demo thresholds?")) run("purge", () => send("DELETE", "/admin/demo-data"), "Demo data removed.").then((ok) => ok && reloadMeta()); }}>Remove demo data</Button>
          </div>
        </Card>
      )}
      <Card title="Change your password">
        {user?.role !== "admin" && feedback}
        <form className="grid max-w-xl gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run("pw", () => send("POST", "/auth/change-password", pw), "Password changed.").then((ok) => ok && setPw({ current_password: "", new_password: "" })); }}>
          <Field label="Current password" required><Input required type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} autoComplete="current-password" /></Field>
          <Field label="New password" required hint="10+ characters with an upper-case letter and a digit"><Input required type="password" minLength={10} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} autoComplete="new-password" /></Field>
          <div><Button type="submit" busy={busy === "pw"}>Change password</Button></div>
        </form>
      </Card>
    </div>
  );
}

export default function Admin() {
  usePageMeta("Admin panel");
  const { user, authReady } = useApp();
  const tabs = [
    { key: "reports", label: "Citizen reports", roles: ["moderator"], el: <Reports /> },
    { key: "observations", label: "Observations", roles: ["auditor", "moderator"], el: <Observations /> },
    { key: "locations", label: "Add location", roles: ["auditor"], el: <AddLocation /> },
    { key: "thresholds", label: "Thresholds", roles: [], el: <Thresholds /> },
    { key: "users", label: "Staff accounts", roles: [], el: <Users /> },
    { key: "activity", label: "Activity log", roles: [], el: <Activity /> },
    { key: "data", label: "Data and account", roles: ["auditor", "moderator"], el: <DataTools /> },
  ].filter((t) => can(user, ...t.roles));
  const [tab, setTab] = useState("");
  const active = tabs.find((t) => t.key === tab) ?? tabs[0];
  if (!authReady) return <Spinner />;
  if (!user) return <><PageHeader title="Admin panel" /><SignInPrompt what="The admin panel is for project staff." /></>;
  return (
    <>
      <PageHeader title="Admin panel" lead={<>Signed in as <strong>{user.email}</strong> ({human(user.role)}).</>} />
      <div role="tablist" aria-label="Admin sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={active.key === t.key} onClick={() => setTab(t.key)}
            className={cx("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", active.key === t.key ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink")}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel">{active.el}</div>
    </>
  );
}
