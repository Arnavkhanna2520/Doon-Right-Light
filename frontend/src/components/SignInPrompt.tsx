import { Lock } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export function SignInPrompt({ what, roles }: { what: string; roles?: string }) {
  const loc = useLocation();
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
      <Lock className="mx-auto size-6 text-muted" aria-hidden />
      <p className="mt-2 font-medium">Staff sign-in required</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{what} {roles && `Available to ${roles}.`}</p>
      <Link to={`/login?next=${encodeURIComponent(loc.pathname)}`} className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-ink">Sign in</Link>
    </div>
  );
}
