import { CheckCircle2, Copy, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PinPicker } from "../components/MapView";
import { Badge, Button, Card, ErrorBox, Field, Input, Note, PageHeader, Select, inputCls } from "../components/ui";
import { get, send } from "../lib/api";
import { REPORT_CATEGORY, REPORT_STATUS, fmtDate } from "../lib/format";
import { usePageMeta } from "../lib/hooks";

const STEPS = ["submitted", "under_review", "verified", "in_progress", "resolved"];

function Track({ initial }: { initial: string }) {
  const [id, setId] = useState(initial);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e?: React.FormEvent) {
    e?.preventDefault();
    if (!id.trim()) { setErr("Enter your report ID."); return; }
    setBusy(true); setErr(""); setRes(null);
    try { setRes(await get(`/reports/track/${encodeURIComponent(id.trim())}`)); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  useEffect(() => { if (initial) go(); /* eslint-disable-next-line */ }, []);
  const idx = res ? STEPS.indexOf(res.status) : -1;
  return (
    <Card title="Track a report" hint="Enter the ID you were given when you submitted.">
      <form onSubmit={go} className="flex gap-2">
        <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="DRL-XXXXXXXX" aria-label="Report ID" className="tabular uppercase" maxLength={16} />
        <Button type="submit" busy={busy}><Search className="size-4" aria-hidden />Check</Button>
      </form>
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
      {res && (
        <div className="mt-4 text-sm">
          <p className="font-semibold">{REPORT_CATEGORY[res.category]}</p>
          <p className="text-muted">Submitted {fmtDate(res.submitted_at)} · last updated {fmtDate(res.updated_at)}</p>
          {res.status === "rejected" ? <p className="mt-3"><Badge tone="danger">Rejected</Badge> <span className="text-muted">This report could not be accepted after review.</span></p> : (
            <ol className="mt-4 grid grid-cols-5 gap-1" aria-label="Report progress">
              {STEPS.map((s, i) => (
                <li key={s} className="text-center" aria-current={i === idx ? "step" : undefined}>
                  <span className={`mx-auto block h-1.5 rounded ${i <= idx ? "bg-ok" : "bg-raised"}`} />
                  <span className={`mt-1 block text-[11px] ${i === idx ? "font-semibold text-ink" : "text-muted"}`}>{REPORT_STATUS[s]}</span>
                </li>
              ))}
            </ol>
          )}
          {res.public_note && <p className="mt-3 rounded-lg bg-raised p-3"><strong>Note from the reviewer:</strong> {res.public_note}</p>}
          {res.possible_duplicate && <p className="mt-2 text-xs text-muted">This location had already been reported; your report was linked to the earlier one.</p>}
        </div>
      )}
    </Card>
  );
}

export default function Report() {
  usePageMeta("Report a lighting issue", "Report glare, light entering your home, dark roads or broken streetlights in Dehradun. No account needed.");
  const [sp] = useSearchParams();
  const started = useRef(Date.now());
  const [f, setF] = useState({ category: "", description: "", location_text: "", contact_name: "", contact_info: "", website: "" });
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  function validate() {
    const e: Record<string, string> = {};
    if (!f.category) e.category = "Choose the kind of problem.";
    if (f.description.trim().length < 10) e.description = "Please describe the problem in at least 10 characters.";
    if (!pin && !f.location_text.trim()) e.location_text = "Describe the location or drop a pin on the map.";
    if (photo && photo.size > 5 * 1024 * 1024) e.photo = "Photo must be 5 MB or smaller.";
    if (photo && !["image/jpeg", "image/png", "image/webp"].includes(photo.type)) e.photo = "Photo must be a JPEG, PNG or WebP image.";
    if ((f.contact_name.trim() || f.contact_info.trim()) && !consent) e.consent = "Tick the box to share your contact details, or clear them.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true); setError("");
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    if (pin) { fd.append("latitude", String(pin[0])); fd.append("longitude", String(pin[1])); }
    if (photo) fd.append("photo", photo);
    fd.append("consent", String(consent));
    fd.append("elapsed_ms", String(Date.now() - started.current));
    try { setDone(await send("POST", "/reports", fd)); window.scrollTo(0, 0); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CheckCircle2 className="size-10 text-ok" aria-hidden />
          <h1 className="mt-3 text-2xl font-semibold">Thank you. Your report was received.</h1>
          <p className="mt-2 text-muted">Keep this ID to check progress. We do not send emails or messages.</p>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-raised p-4">
            <span className="tabular text-2xl font-semibold tracking-wider">{done.public_id}</span>
            <Button variant="outline" small onClick={() => { navigator.clipboard?.writeText(done.public_id); setCopied(true); }}><Copy className="size-4" aria-hidden />{copied ? "Copied" : "Copy"}</Button>
          </div>
          <p className="mt-4 text-sm"><Badge tone="warn">Unverified report</Badge> <span className="text-muted">It will not appear on the public map until a reviewer has checked it.</span></p>
          {done.possible_duplicate && <p className="mt-2 text-sm text-muted">Someone reported the same kind of problem very close to this spot recently, so we have linked the two.</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={`/report?track=1&id=${done.public_id}`} reloadDocument className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-ink">Track this report</Link>
            <Button variant="outline" onClick={() => window.location.assign("/report")}>Report another issue</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Report a lighting issue" lead="Tell us about a light that is too bright, badly aimed, shining into your home, or a road that is dark. No account is needed." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <form onSubmit={submit} noValidate className="space-y-5">
            {error && <ErrorBox message={error} />}
            <Field label="What is the problem?" required error={errors.category}>
              <Select value={f.category} onChange={set("category")} placeholder="Choose a category" options={Object.entries(REPORT_CATEGORY)} aria-invalid={!!errors.category} />
            </Field>
            <Field label="Describe it" required error={errors.description} hint={`${f.description.length}/2000. What do you see, and at what time of night?`}>
              <textarea value={f.description} onChange={set("description")} rows={4} maxLength={2000} className={inputCls} aria-invalid={!!errors.description} />
            </Field>
            <Field label="Where is it?" error={errors.location_text} hint="Road name and a nearby landmark. Please do not enter anyone's house number.">
              <Input value={f.location_text} onChange={set("location_text")} maxLength={300} placeholder="e.g. Main road near the park gate" aria-invalid={!!errors.location_text} />
            </Field>
            <div>
              <p className="mb-1 text-sm font-medium">Map pin <span className="font-normal text-muted">(optional) – click the map to place it, drag to adjust</span></p>
              <PinPicker value={pin} onChange={setPin} />
              <p className="mt-1 flex items-center justify-between text-xs text-muted">
                <span className="tabular">{pin ? `Pin at ${pin[0]}, ${pin[1]}` : "No pin placed."}</span>
                {pin && <button type="button" className="underline" onClick={() => setPin(null)}>Remove pin</button>}
              </p>
            </div>
            <Field label="Photograph (optional)" error={errors.photo} hint="JPEG, PNG or WebP up to 5 MB. Location and camera details stored inside the photo are removed. Avoid showing people or number plates.">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
            </Field>
            <fieldset className="rounded-lg border border-line p-4">
              <legend className="px-1 text-sm font-medium">Contact details (optional)</legend>
              <p className="mb-3 text-xs text-muted">Only needed if you are happy for a reviewer to ask you a follow-up question. They are never shown publicly.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name"><Input value={f.contact_name} onChange={set("contact_name")} maxLength={120} autoComplete="name" /></Field>
                <Field label="Email or phone"><Input value={f.contact_info} onChange={set("contact_info")} maxLength={200} /></Field>
              </div>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4" />
                <span>I agree to these contact details being stored and used only to follow up on this report, as described in the <Link to="/privacy" className="text-info underline">privacy policy</Link>.</span>
              </label>
              {errors.consent && <p role="alert" className="mt-1 text-xs text-danger">{errors.consent}</p>}
            </fieldset>
            {/* Honeypot: hidden from people and assistive technology, tempting to bots. */}
            <div className="absolute -left-[9999px]" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label></div>
            <Button type="submit" busy={busy}>Submit report</Button>
          </form>
        </Card>
        <aside className="space-y-6">
          <Track initial={sp.get("id") ?? ""} />
          <Note><strong>What happens next.</strong> A reviewer reads every report. Until then it is labelled unverified and stays off the public map. Verified reports appear on the map with their position rounded to about 100 m and without your description, photo or contact details.</Note>
          <Note tone="warn"><strong>For emergencies</strong> such as exposed wiring or a fallen pole, contact the electricity department or the Municipal Corporation helpline directly. This is a student-run project, not an official complaint service.</Note>
        </aside>
      </div>
    </>
  );
}
