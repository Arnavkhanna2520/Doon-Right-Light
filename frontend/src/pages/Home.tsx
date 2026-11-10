import { ArrowRight, BarChart3, ClipboardCheck, FileDown, Lightbulb, MapPinned, MessageSquareWarning, ShieldCheck, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Card } from "../components/ui";
import { CLASS_META, fmtNum } from "../lib/format";
import { useApi, useApp, usePageMeta } from "../lib/hooks";

function HeroArt() {
  return (
    <svg viewBox="0 0 520 360" className="w-full" role="img" aria-label="Illustration comparing an unshielded streetlight that spills light into the sky with a shielded one that lights only the road">
      <defs>
        <linearGradient id="spill" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#f5a524" stopOpacity=".55" /><stop offset="1" stopColor="#f5a524" stopOpacity="0" /></linearGradient>
        <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f5a524" stopOpacity=".7" /><stop offset="1" stopColor="#f5a524" stopOpacity=".08" /></linearGradient>
      </defs>
      {[[40, 40], [110, 80], [200, 30], [470, 60], [420, 110], [330, 40], [380, 20], [495, 150], [300, 90]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 ? 1.2 : 1.8} fill="#e6ecf4" opacity={x < 260 ? 0.18 : 0.9} />)}
      <path d="M0 300h520v60H0z" fill="#17243a" /><path d="M0 300h520" stroke="#24344d" strokeWidth="2" />
      <path d="M20 300v-70h40v70zM70 300v-100h46v100zM400 300v-84h44v84zM452 300v-60h48v60z" fill="#111c2e" stroke="#24344d" />
      {/* unshielded */}
      <path d="M150 300V150" stroke="#93a1b5" strokeWidth="5" strokeLinecap="round" />
      <circle cx="150" cy="140" r="64" fill="url(#spill)" /><path d="M86 140 150 20 214 140z" fill="url(#spill)" opacity=".5" />
      <circle cx="150" cy="140" r="11" fill="#ffe9b8" />
      <text x="150" y="335" textAnchor="middle" fill="#93a1b5" fontSize="13" fontWeight="600">Unshielded: light escapes upward</text>
      {/* shielded */}
      <path d="M350 300V150h-26" stroke="#93a1b5" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M304 148h40v8h-40z" fill="#e6ecf4" /><path d="M306 156h36l44 144H262z" fill="url(#cone)" />
      <text x="350" y="335" textAnchor="middle" fill="#93a1b5" fontSize="13" fontWeight="600">Shielded: light lands on the road</text>
    </svg>
  );
}

const FEATURES = [
  { icon: MapPinned, title: "Street-level map", text: "Every surveyed location is classified as over-lit, under-lit, not working or adequate, with the evidence behind it.", to: "/map" },
  { icon: ClipboardCheck, title: "Ground lighting audit", text: "Upload lux-meter surveys as CSV. The platform validates, cleans and classifies each reading against documented thresholds.", to: "/audit" },
  { icon: BarChart3, title: "Hotspot analysis", text: "Getis-Ord Gi* statistics show where high or low readings cluster, with data-quality indicators beside every chart.", to: "/analysis" },
  { icon: MessageSquareWarning, title: "Citizen reporting", text: "Residents report glare, light entering homes, dark roads and broken lights. Reports stay unverified until reviewed.", to: "/report" },
  { icon: Lightbulb, title: "Safety-aware recommendations", text: "Shield, re-aim, repair or review. Reductions are never suggested at junctions, crossings, hospitals or bus stops.", to: "/recommendations" },
  { icon: Zap, title: "Energy calculator", text: "Estimate the energy and cost effect of a wattage change from your own assumptions.", to: "/calculator" },
];

export default function Home() {
  usePageMeta("Street lighting audit for Dehradun", "Doon Right-Light maps where outdoor lighting in Dehradun is too bright, too dim, badly aimed or not working.");
  const { meta } = useApp();
  const { data } = useApi("/stats");
  const k = data?.kpis;
  return (
    <>
      <section className="bg-night text-[#e6ecf4]">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="fade-in">
            <p className="text-sm font-semibold uppercase tracking-widest text-glow">Dehradun, Uttarakhand</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">The right light, in the right place, at the right time.</h1>
            <p className="mt-5 max-w-xl text-lg text-[#b5c0d0]">Doon Right-Light is a street lighting audit platform. It shows where outdoor lighting is brighter than it needs to be, badly aimed, too dim or not working, so that authorities can fix both waste and dark stretches.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/map" className="inline-flex items-center gap-2 rounded-lg bg-glow px-5 py-2.5 font-semibold text-night hover:opacity-90">Open the map <ArrowRight className="size-4" aria-hidden /></Link>
              <Link to="/report" className="inline-flex items-center gap-2 rounded-lg border border-[#34486a] px-5 py-2.5 font-semibold hover:bg-night-2">Report a lighting issue</Link>
            </div>
            <p className="mt-6 text-sm text-[#93a1b5]">The goal is not to remove streetlights. It is to light streets properly and stop paying for light that goes into the sky.</p>
          </div>
          <HeroArt />
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-20 px-4 py-16">
        <section className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">What is light pollution?</h2>
            <p className="mt-3 text-muted">Light pollution is outdoor light that does no useful work: light aimed above the horizontal that brightens the sky, glare that makes it harder to see, and light that spills into homes. It wastes electricity and disturbs people and wildlife. It is usually fixed by aiming and shielding lights well, not by switching them off.</p>
            <ul className="mt-4 space-y-2 text-sm">
              {[["Skyglow", "the brightened night sky over a city"], ["Glare", "light shining into the eyes of drivers and pedestrians"], ["Light trespass", "light falling where it is not wanted, such as bedroom windows"], ["Over-lighting", "more light than the road and its use require"]].map(([a, b]) => (
                <li key={a} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" /><span><strong>{a}:</strong> <span className="text-muted">{b}.</span></span></li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-semibold">Why Dehradun needs measurement</h2>
            <p className="mt-3 text-muted">Dehradun's streetlights have been converted to LED and brighter fixtures are being added on main roads, while residents still report dark stretches and lights that do not work. Nobody has published street-level measurements showing where light matches need and where it does not. India has no statutory framework for light pollution, so local evidence has to come from local measurement.</p>
            <p className="mt-3 text-muted">Satellite images show how much light leaves the city, but a 500 m pixel cannot tell a well-shielded road from a badly aimed one. That takes a lux meter and a walk. This platform is built to hold that ground evidence and turn it into a ranked list of sites to check.</p>
            <Link to="/methodology" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-info hover:underline">Read the methodology and its limits <ArrowRight className="size-3.5" aria-hidden /></Link>
          </div>
        </section>

        <section aria-labelledby="cap">
          <h2 id="cap" className="text-2xl font-semibold">What the platform does</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Link key={f.title} to={f.to} className="group rounded-xl border border-line bg-surface p-5 transition hover:border-accent/60">
                <f.icon className="size-6 text-accent" aria-hidden />
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted">{f.text}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-info">Open <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden /></span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="how">
          <h2 id="how" className="text-2xl font-semibold">How it works</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-4">
            {[["Measure", "Survey teams record lux, fixture condition, shielding and activity at fixed points along a road."],
              ["Validate", "Uploads are checked for missing values, duplicates, wrong types and inconsistent entries before import."],
              ["Classify", "Each reading is compared with the range configured for its road type. No range, no guess: it is marked for expert assessment."],
              ["Act", "Sites are ranked by severity, exposure and confidence, with a suggested fix and the evidence for it."]].map(([t, d], i) => (
              <li key={t} className="rounded-xl border border-line bg-surface p-5">
                <span className="tabular text-sm font-semibold text-accent">Step {i + 1}</span>
                <h3 className="mt-1 font-semibold">{t}</h3><p className="mt-1 text-sm text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="preview" className="grid items-start gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 id="preview" className="text-2xl font-semibold">Monitoring dashboard</h2>
            <p className="mt-3 text-muted">Counts by lighting condition, zone comparisons, monthly trends and priority levels, all responding to the same filters as the map.</p>
            {meta?.has_demo_data && <p className="mt-3"><Badge tone="demo">Demo data</Badge> <span className="text-sm text-muted">The figures shown here currently include synthetic demonstration records, not measurements from Dehradun.</span></p>}
            {k && k.monitored_locations === 0 && <p className="mt-3 text-sm text-muted">No observations have been loaded yet. Staff can import a survey from the Lighting audit page.</p>}
            <Link to="/dashboard" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:opacity-90">Open dashboard <ArrowRight className="size-4" aria-hidden /></Link>
          </div>
          <Card>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(["potential_excessive", "insufficient", "non_functional", "adequate", "needs_investigation"] as const).map((c) => (
                <div key={c} className="rounded-lg bg-raised p-3">
                  <p className="text-xs text-muted">{CLASS_META[c].short}</p>
                  <p className="tabular mt-1 text-2xl font-semibold" style={{ color: CLASS_META[c].color }}>{k ? fmtNum(k[c]) : "–"}</p>
                </div>
              ))}
              <div className="rounded-lg bg-raised p-3"><p className="text-xs text-muted">Locations</p><p className="tabular mt-1 text-2xl font-semibold">{k ? fmtNum(k.monitored_locations) : "–"}</p></div>
            </div>
          </Card>
        </section>

        <section aria-labelledby="benefit" className="grid gap-4 md:grid-cols-3">
          <h2 id="benefit" className="text-2xl font-semibold md:col-span-3">Why it is worth doing</h2>
          {[[Zap, "Lower energy bills", "Right-sizing wattage and shielding fixtures cuts the electricity spent on light nobody uses."],
            [ShieldCheck, "Safer streets", "Dark stretches and broken lights are flagged with the same priority as over-lighting."],
            [FileDown, "Evidence for decisions", "Every flag carries its measurement, date, source and verification status, exportable as CSV or PDF."]].map(([Icon, t, d]: any) => (
            <div key={t} className="rounded-xl border border-line bg-surface p-5"><Icon className="size-6 text-ok" aria-hidden /><h3 className="mt-3 font-semibold">{t}</h3><p className="mt-1 text-sm text-muted">{d}</p></div>
          ))}
        </section>

        <section className="rounded-2xl bg-night p-8 text-[#e6ecf4] sm:p-12">
          <div className="grid items-center gap-6 md:grid-cols-[1.5fr_1fr]">
            <div>
              <h2 className="text-2xl font-semibold">Seen a problem light?</h2>
              <p className="mt-2 text-[#b5c0d0]">Tell us about glare, light coming into your home, a dark road or a broken streetlight. It takes two minutes and you do not need an account. You get a report ID to follow its status.</p>
            </div>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <Link to="/report" className="rounded-lg bg-glow px-5 py-2.5 font-semibold text-night hover:opacity-90">Report an issue</Link>
              <Link to="/report?track=1" className="rounded-lg border border-[#34486a] px-5 py-2.5 font-semibold hover:bg-night-2">Track a report</Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
