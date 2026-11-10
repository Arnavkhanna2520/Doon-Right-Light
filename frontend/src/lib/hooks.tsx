import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { get, send, type Meta, type User } from "./api";

/** Fetch JSON whenever `deps` change. Ignores responses from superseded requests. */
export function useApi<T = any>(path: string | null, params: Record<string, unknown> = {}, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const key = JSON.stringify(params);
  useEffect(() => {
    if (!path) return;
    const id = ++seq.current;
    setLoading(true);
    get<T>(path, params)
      .then((d) => { if (id === seq.current) { setData(d); setError(null); } })
      .catch((e: Error) => { if (id === seq.current) setError(e.message); })
      .finally(() => { if (id === seq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    document.title = `${title} | Doon Right-Light`;
    if (description) {
      document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    }
  }, [title, description]);
}

// ---------------------------------------------------------------- app context
interface AppCtx {
  user: User | null;
  authReady: boolean;
  meta: Meta | null;
  reloadMeta: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  theme: "light" | "dark";
  toggleTheme: () => void;
}
const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem("drl-theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch { /* storage unavailable */ }
    return "dark"; // the night theme is the default; visitors can switch and the choice is remembered
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-fade");
    root.classList.toggle("dark", theme === "dark");
    const t = setTimeout(() => root.classList.remove("theme-fade"), 450);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b0f29" : "#eff0f9");
    try { localStorage.setItem("drl-theme", theme); } catch { /* ignore */ }
    return () => clearTimeout(t);
  }, [theme]);

  const reloadMeta = useCallback(() => { get<Meta>("/meta").then(setMeta).catch(() => setMeta(null)); }, []);
  useEffect(() => {
    reloadMeta();
    get<{ user: User | null }>("/auth/session")
      .then((d) => setUser(d.user))
      .catch((e) => console.error(e))
      .finally(() => setAuthReady(true));
  }, [reloadMeta]);

  const value = useMemo<AppCtx>(() => ({
    user, authReady, meta, reloadMeta, theme,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    login: async (email, password) => { setUser(await send<User>("POST", "/auth/login", { email, password })); },
    logout: async () => { await send("POST", "/auth/logout"); setUser(null); },
  }), [user, authReady, meta, reloadMeta, theme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
export const can = (user: User | null, ...roles: string[]) => !!user && (user.role === "admin" || roles.includes(user.role));
