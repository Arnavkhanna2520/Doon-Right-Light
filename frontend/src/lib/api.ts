// Thin fetch wrapper. All requests are same-origin; the session lives in an httpOnly cookie.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parse(res: Response) {
  if (res.ok) return res;
  let msg = `Request failed (${res.status}).`;
  try {
    const body = await res.json();
    if (typeof body.detail === "string") msg = body.detail;
  } catch {
    /* non-JSON error body */
  }
  throw new ApiError(res.status, msg);
}

export function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function get<T = any>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await parse(await fetch(`/api${path}${qs(params)}`, { credentials: "same-origin" }));
  return res.json();
}

export async function send<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin" };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await parse(await fetch(`/api${path}`, init));
  return res.json();
}

/** Download a file from an authenticated endpoint and save it. */
export async function download(path: string, params: Record<string, unknown> = {}, init?: RequestInit) {
  const res = await parse(await fetch(`/api${path}${qs(params)}`, { credentials: "same-origin", ...init }));
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "download";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface Observation {
  id: number;
  measured_at: string;
  lux: number | null;
  weather: string;
  fixture_status: string;
  fixture_wattage: number | null;
  shielding: string;
  light_direction: string;
  pedestrian_activity: string;
  vehicle_activity: string;
  notes: string;
  data_origin: string;
  verification_status: string;
  classification: string;
  classification_label: string;
  classification_basis: string;
}
export interface Feature {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  zone: string;
  road_type: string;
  safety_critical: boolean;
  safety_context: string;
  observation_count: number;
  priority_level: string;
  priority_score: number;
  latest: Observation;
}
export interface Rec {
  id: number;
  action: string;
  title: string;
  rationale: string;
  evidence: string[];
  evidence_level: string;
  safety_hold: boolean;
  priority_score: number;
  priority_level: string;
  status: string;
  location?: { id: number; name: string; zone: string; road_type: string; safety_critical: boolean; safety_context: string };
}
export interface Meta {
  study_area: { name: string; center: [number, number]; min_lat: number; max_lat: number; min_lon: number; max_lon: number };
  enums: Record<string, any>;
  zones: string[];
  has_demo_data: boolean;
  has_real_data: boolean;
  satellite: { configured: boolean; message: string; limitations: string[]; product: string; resolution: string; source_url: string };
}
export interface User {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "auditor" | "moderator";
  is_active: boolean;
}
export interface FilterState {
  zone: string;
  classification: string;
  verification: string;
  origin: string;
  priority: string;
  date_from: string;
  date_to: string;
  q: string;
}
export const EMPTY_FILTERS: FilterState = {
  zone: "", classification: "", verification: "", origin: "", priority: "", date_from: "", date_to: "", q: "",
};
