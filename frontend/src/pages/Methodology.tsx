import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Card, ClassLabel, Note, PageHeader } from "../components/ui";
import { human } from "../lib/format";
import { useApi, useApp, usePageMeta } from "../lib/hooks";

const SOURCES: [string, string, string][] = [
  ["NASA Black Marble VNP46A2", "Daily moonlight- and atmosphere-corrected night-time radiance, about 500 m, from 2012. Optional integration; not active unless configured.", "https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VNP46A2/"],
  ["Google Earth Engine catalogue: NASA/VIIRS/002/VNP46A2", "How the optional integration reads Black Marble.", "https://developers.google.com/earth-engine/datasets/catalog/NASA_VIIRS_002_VNP46A2"],
  ["OpenStreetMap", "Base map tiles. © OpenStreetMap contributors, Open Database Licence.", "https://www.openstreetmap.org/copyright"],
  ["IS 1944: Code of practice for lighting of public thoroughfares (BIS)", "The Indian road-lighting reference. Thresholds must be taken from the applicable edition by an administrator; none are built in.", "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/knowyourstandards/Indian_standards/isdetails/NjcwMDU="],
  ["CPCB submission to the National Green Tribunal (reported April 2025)", "States that India has no statutory framework regulating light pollution.", "https://www.deccanherald.com/india/karnataka/bengaluru/no-statutory-framework-in-india-to-regulate-light-pollution-cpcb-tells-green-tribunal-3515178"],
  ["Getis and Ord (1992); Ord and Getis (1995)", "The Gi* local spatial statistic used for hotspot analysis.", "https://doi.org/10.1111/j.1538-4632.1995.tb00912.x"],
];

export default function Methodology() {
  usePageMeta("Methodology and limitations", "How Doon Right-Light classifies lighting, scores priority and detects hotspots, with data sources and limitations.");
  const { meta } = useApp();
  const th = useApi("/thresholds");
  const { hash } = useLocation();
  useEffect(() => { if (hash) document.querySelector(hash)?.scrollIntoView(); }, [hash]);
  const H = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} className="scroll-mt-20 text-xl font-semibold">{children}</h2>;
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader title="Methodology and limitations" lead="What the platform measures, how it reaches each classification, and what it cannot tell you." />

      <section className="space-y-3">
        <H id="provenance">Four kinds of data, always labelled</H>
        <ul className="space-y-2 text-sm">
          <li><strong>Ground-measured observations</strong> – lux readings and fixture records collected on the street and uploaded by an auditor. Unverified until checked.</li>
          <li><strong>Satellite-derived observations</strong> – night-time radiance from NASA Black Marble. Used only for city-wide context. {meta?.satellite.configured ? "Configured in this deployment." : "Not integrated in this deployment, so no satellite values are shown anywhere."}</li>
          <li><strong>Citizen reports</strong> – submitted by the public. Leads to verify, never measurements. Hidden from the public map until reviewed.</li>
          <li><strong>Synthetic demonstration data</strong> – invented records on a grid with generic names, used to show how the platform works. Labelled DEMO everywhere, drawn with a dotted outer ring, and impossible to mark as verified.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <H id="classification">Classification rules</H>
        <p className="text-sm text-muted">Applied in this order to the most recent observation at each location:</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>Fixture recorded as not working → <ClassLabel k="non_functional" /></li>
          <li>No lux reading → <ClassLabel k="needs_investigation" /></li>
          <li>No range configured for the road type → <ClassLabel k="needs_investigation" /> (requires expert assessment)</li>
          <li>Lux below the configured range → <ClassLabel k="insufficient" /></li>
          <li>Lux above the configured range → <ClassLabel k="potential_excessive" /></li>
          <li>Otherwise → <ClassLabel k="adequate" /></li>
        </ol>
        <Note tone="warn">The platform contains no built-in lux limits and does not claim any value as an official standard. Ranges are entered by an administrator, each with its basis and source. “Potential” excessive lighting means a reading above the configured range; whether it is actually excessive is an engineering judgement.</Note>
        <Card title="Ranges currently in force">
          {th.data?.items.length ? (
            <ul className="divide-y divide-line text-sm">{th.data.items.map((t: any) => <li key={t.road_type} className="flex flex-wrap justify-between gap-2 py-2"><span className="font-medium">{human(t.road_type)}</span><span className="tabular">{t.min_lux}–{t.max_lux} lux</span><span className="w-full text-xs text-muted">{t.basis_label}. {t.source_note}</span></li>)}</ul>
          ) : <p className="text-sm text-muted">None configured. Every measured location is currently “requires investigation”.</p>}
        </Card>
      </section>

      <section className="space-y-3">
        <H id="priority">Priority score</H>
        <p className="rounded-lg bg-raised p-3 text-center font-medium">priority = severity × exposure × confidence × 100</p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li><strong>Severity</strong> (0–1): how far the reading is outside the configured range, as a fraction of the nearer limit, capped at 1. A non-functional fixture is 1.</li>
          <li><strong>Exposure</strong>: the higher of recorded pedestrian and vehicle activity (low 0.4, medium 0.7, high 1.0, unknown 0.6). Raised by a quarter for dark or broken lights at safety-critical locations.</li>
          <li><strong>Confidence</strong>: expert verified 1.0, verified 0.85, unverified 0.5.</li>
          <li>50 or more is high priority, 25 or more is medium, below that is low.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <H id="safety">Safety rules for recommendations</H>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>No reduction in lighting is ever suggested at a location flagged safety-critical (junctions, pedestrian crossings, hospitals, bus stops and similar). The platform asks for an on-site safety assessment instead.</li>
          <li>Unverified readings produce only a request to re-measure, or a fault check for a dead fixture.</li>
          <li>Shielding and re-aiming are preferred because they cut wasted light without lowering light on the road.</li>
          <li>Recommendations are options for a qualified engineer to assess. They are not instructions.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <H id="hotspots">Hotspot analysis</H>
        <p className="text-sm">The Getis-Ord Gi* statistic compares the sum of lux values around each location (inside a chosen distance band, including the location itself) with what would be expected if values were scattered at random. The result is a z-score. Values beyond ±1.65, ±1.96 and ±2.58 are reported as significant at 90%, 95% and 99%.</p>
        <p className="text-sm text-muted">It needs at least 30 locations with a lux reading. Results depend on the distance band, uneven sampling can create or hide clusters, and testing many locations at once produces some false positives. A high-lux cluster is not proof of excessive lighting.</p>
      </section>

      <section className="space-y-3">
        <H id="satellite">Why satellite data is not enough</H>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">{meta?.satellite.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </section>

      <section className="space-y-3">
        <H id="limits">Limitations of this platform</H>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>It covers only surveyed locations. No marker means not surveyed, not “no problem”.</li>
          <li>A single lux reading varies with moonlight, weather, wet roads, passing headlights and shop closing times. Repeat visits matter.</li>
          <li>Handheld lux meters and phone sensors differ in accuracy, especially below 1 lux.</li>
          <li>Road type is assigned by the surveyor and affects the classification.</li>
          <li>Energy figures are estimates from nameplate wattage and assumed hours, not metered consumption.</li>
          <li>Citizen reports reflect who chose to report; they are not a representative sample.</li>
          <li>This is a student project and not an official service of any government body.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <H id="sources">Data sources and attribution</H>
        <ul className="space-y-3 text-sm">{SOURCES.map(([name, what, url]) => <li key={name}><a className="font-medium text-info underline" href={url} rel="noreferrer">{name}</a><span className="block text-muted">{what}</span></li>)}</ul>
      </section>
    </div>
  );
}
