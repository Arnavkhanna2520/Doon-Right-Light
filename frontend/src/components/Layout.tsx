import { FlaskConical, LogOut, Menu, Moon, ShieldCheck, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { can, useApp } from "../lib/hooks";
import { cx } from "./ui";

export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Doon Right-Light logo">
      <rect width="64" height="64" rx="16" fill="#141a3d" />
      <path d="M14 20h36a4 4 0 0 1 4 4v2H10v-2a4 4 0 0 1 4-4z" fill="#e6ecf4" />
      <path d="M16 28h32l8 26H8z" fill="#ffb347" opacity=".9" />
      <circle cx="32" cy="27" r="3" fill="#fff7e0" />
    </svg>
  );
}

// Public pages: anyone can use these without an account.
const NAV: [string, string][] = [
  ["/dashboard", "Dashboard"], ["/map", "Map"], ["/analysis", "Analysis"],
  ["/recommendations", "Recommendations"], ["/calculator", "Calculator"], ["/guide", "Guide"],
];
// Staff pages: shown only after signing in, in their own bar, filtered by role.
const STAFF: [string, string, string[]][] = [
  ["/upload", "Upload data", ["auditor"]], ["/records", "Records", ["auditor", "moderator"]],
  ["/downloads", "Reports", ["auditor", "moderator"]], ["/admin", "Admin", ["auditor", "moderator"]],
];

export default function Layout() {
  const { user, logout, theme, toggleTheme, meta } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const link = ({ isActive }: { isActive: boolean }) =>
    cx("whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition", isActive ? "bg-raised text-ink" : "text-muted hover:text-ink");
  const home = loc.pathname === "/";
  const staff = user ? STAFF.filter(([, , roles]) => can(user, ...roles)) : [];
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className={cx("z-40 text-ink", home ? "dark absolute inset-x-0 top-0" : "sticky top-0 border-b border-line bg-bg/80 backdrop-blur-md")}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Link to="/" className="display flex shrink-0 items-center gap-2 whitespace-nowrap text-lg font-semibold"><Logo className="size-8" /><span>Doon Right-Light</span></Link>
          <nav aria-label="Main" className="ml-4 hidden items-center gap-0.5 xl:flex">
            {NAV.map(([to, label]) => <NavLink key={to} to={to} className={link}>{label}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <Link to="/report" className="hidden whitespace-nowrap rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-brand-ink hover:brightness-110 sm:block">Report an issue</Link>
            <button role="switch" aria-checked={theme === "dark"} onClick={toggleTheme} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              aria-label="Dark mode" className="relative flex h-8 w-[3.75rem] shrink-0 items-center justify-between rounded-full border border-line bg-raised px-2 text-muted">
              <Sun className="size-3.5" aria-hidden /><Moon className="size-3.5" aria-hidden />
              <span className={cx("absolute top-[3px] grid size-6 place-items-center rounded-full bg-brand text-brand-ink shadow transition-[left] duration-300", theme === "dark" ? "left-[calc(100%-1.65rem)]" : "left-[3px]")}>
                {theme === "dark" ? <Moon className="size-3.5" aria-hidden /> : <Sun className="size-3.5" aria-hidden />}
              </span>
            </button>
            {user ? (
              <>
                <button onClick={() => logout()} className="hidden items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted hover:text-ink sm:flex" title={`Signed in as ${user.email}`}><LogOut className="size-4" aria-hidden /><span className="whitespace-nowrap">Sign out</span></button>
              </>
            ) : <NavLink to="/login" className={({ isActive }) => cx(link({ isActive }), "hidden sm:block")}>Staff sign in</NavLink>}
            <button className="rounded-md p-2 text-muted hover:bg-raised xl:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-nav" aria-label="Menu">
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label="Mobile" className="grid gap-1 border-t border-line bg-surface px-4 py-3 xl:hidden">
            {NAV.map(([to, label]) => <NavLink key={to} to={to} className={link}>{label}</NavLink>)}
            <NavLink to="/report" className={link}>Report an issue</NavLink>
            {staff.length > 0 && <p className="mt-2 px-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Staff</p>}
            {staff.map(([to, label]) => <NavLink key={to} to={to} className={link}>{label}</NavLink>)}
            {user ? <button onClick={() => logout()} className="rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-muted">Sign out ({user.email})</button>
              : <NavLink to="/login" className={link}>Staff sign in</NavLink>}
          </nav>
        )}
        {staff.length > 0 && !home && (
          <nav aria-label="Staff" className="hidden border-t border-line bg-surface sm:block">
            <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-1.5">
              <span className="mr-2 flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><ShieldCheck className="size-4" aria-hidden />Staff area</span>
              {staff.map(([to, label]) => <NavLink key={to} to={to} className={link}>{label}</NavLink>)}
              <span className="ml-auto shrink-0 text-xs text-muted">Signed in as {user?.email} ({user?.role})</span>
            </div>
          </nav>
        )}
      </header>
      {meta?.has_demo_data && !home && (
        <div className="border-b border-accent/40 bg-accent-soft text-sm" role="note">
          <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2">
            <FlaskConical className="size-4 shrink-0 text-accent" aria-hidden />
            <p><strong className="text-accent">Demo data is loaded.</strong> The areas are real places, but every number marked DEMO is an invented example, not a measurement or complaint from that area.
              {meta.has_real_data ? " Real records are labelled separately." : " No real observations have been imported yet."}</p>
          </div>
        </div>
      )}
      <main id="main" className={cx("flex-1", !home && "mx-auto w-full max-w-7xl px-4 py-8")}><Outlet /></main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 font-semibold"><Logo className="size-6" />Doon Right-Light</div>
            <p className="mt-2 text-muted">The right light, in the right place, at the right time. A student-built street lighting audit platform for Dehradun, Uttarakhand.</p>
          </div>
          <div><h2 className="font-semibold">Platform</h2><ul className="mt-2 space-y-1.5 text-muted">
            <li><Link className="hover:text-ink" to="/dashboard">Dashboard</Link></li><li><Link className="hover:text-ink" to="/map">Interactive map</Link></li>
            <li><Link className="hover:text-ink" to="/guide">How to use this site</Link></li><li><Link className="hover:text-ink" to="/report">Report an issue</Link></li></ul></div>
          <div><h2 className="font-semibold">About the data</h2><ul className="mt-2 space-y-1.5 text-muted">
            <li><Link className="hover:text-ink" to="/methodology">Methodology and limitations</Link></li>
            <li><Link className="hover:text-ink" to="/methodology#sources">Data sources</Link></li>
            <li><Link className="hover:text-ink" to="/privacy">Privacy policy</Link></li>
            <li><a className="hover:text-ink" href="https://github.com/Arnavkhanna2520/doon-right-light#readme" rel="noreferrer">Documentation</a></li></ul></div>
          <div><h2 className="font-semibold">Contact</h2>
            <p className="mt-2 text-muted">Questions, corrections or data to contribute? Open an issue on the project repository.</p>
            <a className="mt-2 inline-block text-info hover:underline" href="https://github.com/Arnavkhanna2520/doon-right-light/issues" rel="noreferrer">github.com/Arnavkhanna2520/doon-right-light</a></div>
        </div>
        <div className="border-t border-line py-4 text-center text-xs text-muted">Base map © <a className="underline" href="https://www.openstreetmap.org/copyright" rel="noreferrer">OpenStreetMap</a> contributors. Not an official Government of Uttarakhand service.</div>
      </footer>
    </div>
  );
}
