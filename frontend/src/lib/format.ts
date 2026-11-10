export const CLASS_META: Record<string, { label: string; color: string; shape: string; short: string }> = {
  potential_excessive: { label: "Potential excessive lighting", short: "Excessive", color: "var(--c-excess)", shape: "triangle" },
  insufficient: { label: "Insufficient lighting", short: "Insufficient", color: "var(--c-insufficient)", shape: "square" },
  non_functional: { label: "Non-functional streetlight", short: "Non-functional", color: "var(--c-broken)", shape: "cross" },
  adequate: { label: "Adequately illuminated", short: "Adequate", color: "var(--c-adequate)", shape: "circle" },
  needs_investigation: { label: "Requires investigation", short: "Investigate", color: "var(--c-investigate)", shape: "diamond" },
};
export const CLASS_KEYS = Object.keys(CLASS_META);

export const ORIGIN_LABEL: Record<string, string> = {
  demo: "Demo data",
  ground_measured: "Ground measured",
  imported: "Imported dataset",
  satellite: "Satellite-derived",
};
export const VERIFY_LABEL: Record<string, string> = {
  unverified: "Unverified",
  verified: "Verified observation",
  expert_verified: "Expert verified",
};
export const REPORT_CATEGORY: Record<string, string> = {
  excessive_brightness: "Excessive streetlight brightness",
  light_trespass: "Light entering my home",
  poorly_directed: "Poorly directed outdoor lighting",
  unnecessary_building_lighting: "Unnecessarily illuminated building",
  broken_streetlight: "Broken streetlight",
  dark_road: "Dark or poorly lit road",
  other: "Other lighting problem",
};
export const REPORT_STATUS: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  verified: "Verified",
  in_progress: "In progress",
  resolved: "Resolved",
  rejected: "Rejected",
};
export const PRIORITY_COLOR: Record<string, string> = {
  high: "var(--c-broken)", medium: "var(--c-excess)", low: "var(--c-investigate)", none: "var(--line)",
};

export const human = (s: string | null | undefined) =>
  (s ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function fmtDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", withTime
    ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" });
}
export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? "–" : n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
