import { Link } from "react-router-dom";
import { usePageMeta } from "../lib/hooks";

export default function NotFound() {
  usePageMeta("Page not found");
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="tabular text-6xl font-semibold text-accent">404</p>
      <h1 className="mt-3 text-2xl font-semibold">This street isn't on our map</h1>
      <p className="mt-2 text-muted">The page you asked for does not exist or has moved.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-ink">Go to the home page</Link>
        <Link to="/map" className="rounded-lg border border-line px-4 py-2 text-sm font-medium">Open the map</Link>
        <Link to="/report" className="rounded-lg border border-line px-4 py-2 text-sm font-medium">Report an issue</Link>
      </div>
    </div>
  );
}
