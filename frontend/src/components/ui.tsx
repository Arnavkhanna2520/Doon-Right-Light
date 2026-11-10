import { AlertTriangle, ChevronLeft, ChevronRight, Info, Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { CLASS_META, ORIGIN_LABEL, VERIFY_LABEL, human } from "../lib/format";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({ children, className, title, hint, actions }: {
  children: ReactNode; className?: string; title?: string; hint?: string; actions?: ReactNode;
}) {
  return (
    <section className={cx("min-w-0 rounded-xl border border-line bg-surface p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {lead && <p className="mt-2 text-muted">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline"; busy?: boolean; small?: boolean };
export function Button({ variant = "primary", busy, small, className, children, disabled, ...rest }: BtnProps) {
  const styles = {
    primary: "bg-brand text-brand-ink hover:opacity-90",
    outline: "border border-line bg-surface text-ink hover:bg-raised",
    ghost: "text-ink hover:bg-raised",
    danger: "bg-danger text-white hover:opacity-90 dark:text-night",
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cx("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        small ? "px-2.5 py-1.5 text-sm" : "px-4 py-2 text-sm", styles, className)}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-accent";

export function Field({ label, hint, error, children, required }: {
  label: string; hint?: string; error?: string; children: ReactNode; required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">
        {label} {required && <span className="text-danger" aria-hidden>*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export function Select({ options, placeholder, ...p }: SelectHTMLAttributes<HTMLSelectElement> & {
  options: [string, string][]; placeholder?: string;
}) {
  return (
    <select {...p} className={cx(inputCls, p.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function Badge({ children, tone = "neutral", title }: {
  children: ReactNode; tone?: "neutral" | "demo" | "ok" | "warn" | "danger" | "info"; title?: string;
}) {
  const t = {
    neutral: "border-line bg-raised text-muted",
    demo: "border-accent/50 bg-accent-soft text-accent",
    ok: "border-ok/40 bg-ok/10 text-ok",
    warn: "border-accent/40 bg-accent-soft text-accent",
    danger: "border-danger/40 bg-danger/10 text-danger",
    info: "border-info/40 bg-info/10 text-info",
  }[tone];
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", t)}>
      {children}
    </span>
  );
}

/** The one place that decides how provenance is labelled. Demo always wins. */
export function ProvenanceBadge({ origin, verification }: { origin: string; verification: string }) {
  if (origin === "demo") return <Badge tone="demo" title="Synthetic demonstration record. Not a real observation of Dehradun.">Demo data</Badge>;
  if (verification === "unverified") {
    return <><Badge title={ORIGIN_LABEL[origin]}>{ORIGIN_LABEL[origin] ?? human(origin)}</Badge> <Badge tone="warn" title="Not yet checked by an authorised person.">Unverified</Badge></>;
  }
  return <><Badge>{ORIGIN_LABEL[origin] ?? human(origin)}</Badge> <Badge tone="ok">{VERIFY_LABEL[verification]}</Badge></>;
}

export function ClassDot({ k, size = 12 }: { k: string; size?: number }) {
  const m = CLASS_META[k] ?? CLASS_META.needs_investigation;
  return <span aria-hidden dangerouslySetInnerHTML={{ __html: shapeSvg(m.shape, m.color, size, false) }} className="inline-block align-middle" />;
}
export function ClassLabel({ k }: { k: string }) {
  return <span className="inline-flex items-center gap-1.5"><ClassDot k={k} />{CLASS_META[k]?.label ?? human(k)}</span>;
}

/** Marker shapes differ by class so the map does not rely on colour alone. Demo markers are hollow. */
export function shapeSvg(shape: string, color: string, size: number, hollow: boolean): string {
  const fill = hollow ? "var(--surface)" : color;
  const common = `fill="${fill}" stroke="${color}" stroke-width="${hollow ? 2.6 : 1.4}" stroke-linejoin="round"`;
  const body = {
    circle: `<circle cx="10" cy="10" r="7" ${common}/>`,
    square: `<rect x="3.5" y="3.5" width="13" height="13" rx="2" ${common}/>`,
    triangle: `<path d="M10 2.5 18 17H2z" ${common}/>`,
    diamond: `<path d="M10 2 18 10 10 18 2 10z" ${common}/>`,
    cross: `<circle cx="10" cy="10" r="8" ${common}/><path d="M6.5 6.5l7 7M13.5 6.5l-7 7" stroke="${hollow ? color : "#fff"}" stroke-width="2" stroke-linecap="round"/>`,
  }[shape] ?? "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="${size}" height="${size}">${body}</svg>`;
}

export const Spinner = ({ label = "Loading" }: { label?: string }) => (
  <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
    <Loader2 className="size-5 animate-spin" aria-hidden /> {label}…
  </div>
);
export const ErrorBox = ({ message, retry }: { message: string; retry?: () => void }) => (
  <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
    <AlertTriangle className="size-4 shrink-0" aria-hidden /> <span className="flex-1">{message}</span>
    {retry && <Button small variant="outline" onClick={retry}>Try again</Button>}
  </div>
);
export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="rounded-lg border border-dashed border-line p-8 text-center">
    <p className="font-medium">{title}</p>
    {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
  </div>
);
export const Note = ({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) => (
  <div className={cx("flex gap-2.5 rounded-lg border p-3 text-sm", tone === "warn" ? "border-accent/40 bg-accent-soft" : "border-line bg-raised")}>
    {tone === "warn" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />}
    <div className="min-w-0">{children}</div>
  </div>
);

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="mt-3 text-xs text-muted">{total} record{total === 1 ? "" : "s"}</p>;
  return (
    <nav aria-label="Pagination" className="mt-3 flex items-center justify-between text-sm">
      <span className="text-muted">Page {page} of {pages} · {total} records</span>
      <span className="flex gap-2">
        <Button small variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="size-4" aria-hidden />Previous</Button>
        <Button small variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next<ChevronRight className="size-4" aria-hidden /></Button>
      </span>
    </nav>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-raised text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cx("px-3 py-2 align-top", className)}>{children}</td>;
export { cx };
