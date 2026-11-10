import { FlaskConical, LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { can, useApp } from "../lib/hooks";
import { cx } from "./ui";

export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Doon Right-Light logo">
      <rect width="64" height="64" rx="14" fill="#0b1320" />
      <path d="M14 20h36a4 4 0 0 1 4 4v2H10v-2a4 4 0 0 1 4-4z" fill="#e6ecf4" />
      <path d="M16 28h32l8 26H8z" fill="#f5a524" opacity=".9" />
      <circle cx="32" cy="27" r="3" fill="#fff7e0" />
    </svg>
  );
}

const NAV: [string, string][] = [
  ["/dashboard", "Dashboard"], ["/map", "Map"], ["/analysis", "Analysis"], ["/audit", "Lighting audit"],
  ["/recommendations", "Recommendations"], ["/calculator", "Energy calculator"], ["/downloads", "Reports"],
];

export default function Layout() {
  const { user, logout, theme, toggleTheme, meta } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const link = ({ isActive }: { isActive: boolean }) =>
    cx("rounded-md px-2.5 py-1.5 text-sm font-medium transition", isActive ? "bg-raised text-ink" : "text-muted hover:text-ink");
  const home = loc.pathname === "/";
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold"><Logo className="size-7" /><span>Doon Right-Light</span></Link>
          <nav aria-label="Main" className="ml-4 hidden items-center gap-0.5 xl:flex">
            {NAV.map(([to, label]) => <NavLink key={to} to={to} className={link}>{label}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <Link to="/report" className="hidden rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-ink hover:opacity-90 sm:block">Report an issue</Link>
            <button onClick={toggleTheme} className="rounded-md p-2 text-muted hover:bg-raised hover:text-ink" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title="Switch theme">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            {user ? (
              <>
                {can(user, "moderator", "auditor") && <NavLink to="/admin" className={({ isActive }) => cx(link({ isActive }), "hidden sm:block")}>Admin</NavLink>}
                <button onClick={() => logout()} className="hidden items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted hover:text-ink sm:flex" title={`Signed in as ${user.email}`}><LogOut className="size-4" aria-hidden />Sign out</button>
              </>
            ) : <NavLink to="/login" className={({ isActive }) => cx(link({ isActive }), "hidden sm:block")}>Staff sign in</NavLink>}
            <button className="rounded-md p-2 text-muted hover:bg-raised xl:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-nav" aria-label="Menu">
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label="Mobile" className="grid gap-1 border-t border-line px-4 py-3 xl:hidden">
            {NAV.map(([to, label]) => <NavLink key={to} to={to} className={link}>{label}</NavLink>)}
            <NavLink to="/report" className={link}>Report an issue</NavLink>
            {user && can(user, "moderator", "auditor") && <NavLink to="/admin" className={link}>Admin</NavLink>}
            {user ? <button onClick={() => logout()} className="rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-muted">Sign out ({user.email})</button>
              : <NavLink to="/login" className={link}>Staff sign in</NavLink>}
          </nav>
        )}
      </header>
      {meta?.has_demo_data && !home && (
        <div className="border-b border-accent/40 bg-accent-soft text-sm" role="note">
          <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2">
            <FlaskConical className="size-4 shrink-0 text-accent" aria-hidden />
            <p><strong className="text-accent">Demo data is loaded.</strong> Records marked DEMO are synthetic and are not measurements, fixtures or complaints from Dehradun.
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
            <li><Link className="hover:text-ink" to="/analysis">Analysis</Link></li><li><Link className="hover:text-ink" to="/report">Report an issue</Link></li></ul></div>
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
