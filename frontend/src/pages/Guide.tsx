import { BarChart3, Calculator, ClipboardCheck, FileDown, LayoutDashboard, Lightbulb, MapPinned, MessageSquareWarning, Settings } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Note, PageHeader } from "../components/ui";
import { usePageMeta } from "../lib/hooks";

const PAGES = [
  { id: "dashboard", to: "/dashboard", icon: LayoutDashboard, name: "Dashboard", who: "Everyone", what: "The summary: how many places were checked and how many are too bright, too dim, broken or fine.",
    steps: ["Read the sentence and the coloured Light balance bar at the top.", "Look at the number cards, then the charts.", "Change Area, Lighting category or the dates. Everything updates to match."] },
  { id: "map", to: "/map", icon: MapPinned, name: "Map", who: "Everyone", what: "Every checked location shown on a map of Dehradun.",
    steps: ["Click an area button (for example Rajpur Road) to zoom there.", "Click any glowing dot to see its reading and what should be done.", "Use the layers button on the map to change the map style or switch the heatmap on."] },
  { id: "analysis", to: "/analysis", icon: BarChart3, name: "Analysis", who: "Everyone", what: "Deeper statistics: where bright or dark readings cluster, and how reliable the data is.",
    steps: ["Read the four data-quality bars first.", "Scroll to the hotspot table to see clusters.", "Change the distance band to see how the clusters change."] },
  { id: "recommendations", to: "/recommendations", icon: Lightbulb, name: "Recommendations", who: "Everyone", what: "A to-do list for the authorities, most urgent first.",
    steps: ["Read a card: it says what to do and where.", "Open “Evidence behind this recommendation” to see why.", "Filter by priority, action or area."] },
  { id: "calculator", to: "/calculator", icon: Calculator, name: "Calculator", who: "Everyone", what: "Estimates the electricity and money saved by changing lamp wattage.",
    steps: ["Type the number of lights, current watts and new watts.", "Add hours per night, days and the price per unit.", "Read the saving, or press PDF to download it."] },
  { id: "report", to: "/report", icon: MessageSquareWarning, name: "Report an issue", who: "Everyone, no account", what: "Lets any resident report a bad light or a dark road.",
    steps: ["Choose the problem and describe it.", "Say where it is, or click the small map to drop a pin.", "Submit and keep the report ID. Type it into “Track a report” to follow progress."] },
  { id: "audit", to: "/audit", icon: ClipboardCheck, name: "Audit", who: "Team (sign in)", what: "Puts your real street measurements into the site.",
    steps: ["Download the CSV template and fill in your readings. Put the real area name in the zone column.", "Choose the file and press Validate file. Fix any mistakes it lists.", "Press Import. The readings appear on the map and dashboard."] },
  { id: "downloads", to: "/downloads", icon: FileDown, name: "Reports", who: "Team (sign in)", what: "Downloads the data as a PDF report or Excel-friendly CSV files.",
    steps: ["Set the dates and filters.", "Tick the sections you want.", "Press Download PDF report, or a Download CSV button."] },
  { id: "admin", to: "/admin", icon: Settings, name: "Admin", who: "Team (sign in)", what: "The control room for reports, readings, limits and team accounts.",
    steps: ["Citizen reports: open a report, set its status, write a note.", "Observations: press Verify once a reading has been checked on site.", "Thresholds: enter the correct lux range for each road type, with its source."] },
];

export default function Guide() {
  usePageMeta("How to use this site", "A short, plain-language guide to every page of Doon Right-Light.");
  const { hash } = useLocation();
  useEffect(() => { if (hash) document.querySelector(hash)?.scrollIntoView(); }, [hash]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="How to use this site" lead="Each page in three steps. Pick the one you need." />
      <nav aria-label="Pages" className="mb-8 flex flex-wrap gap-2">
        {PAGES.map((p) => <a key={p.id} href={`#${p.id}`} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:border-accent">{p.name}</a>)}
      </nav>
      <div className="space-y-4">
        {PAGES.map((p) => (
          <section key={p.id} id={p.id} className="scroll-mt-24 rounded-2xl border border-line bg-surface p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent"><p.icon className="size-5" aria-hidden /></span>
              <div className="min-w-0 flex-1"><h2 className="text-xl font-semibold">{p.name}</h2><p className="text-sm text-muted">{p.who}</p></div>
              <Link to={p.to} className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-brand-ink hover:brightness-110">Open {p.name}</Link>
            </div>
            <p className="mt-4">{p.what}</p>
            <ol className="mt-3 space-y-2">
              {p.steps.map((s, i) => <li key={i} className="flex gap-3 text-sm"><span className="display grid size-6 shrink-0 place-items-center rounded-full bg-raised font-semibold">{i + 1}</span><span className="pt-0.5 text-muted">{s}</span></li>)}
            </ol>
          </section>
        ))}
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Note tone="warn"><strong>Demo data.</strong> While the orange banner is showing, the areas on the map are real places but every number is an invented example. Real results appear after your team uploads its own measurements.</Note>
        <Note><strong>Dark and light mode.</strong> Use the sun and moon switch in the top bar. Your choice is remembered.</Note>
      </div>
    </div>
  );
}
