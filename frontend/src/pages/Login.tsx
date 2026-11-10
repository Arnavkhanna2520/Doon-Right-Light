import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, ErrorBox, Field, Input } from "../components/ui";
import { useApp, usePageMeta } from "../lib/hooks";

export default function Login() {
  usePageMeta("Staff sign in");
  const { user, login } = useApp();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const raw = sp.get("next") ?? "/admin";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/admin"; // same-site paths only
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={next} replace />;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await login(email, password); nav(next, { replace: true }); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-sm py-8">
      <Card>
        <h1 className="text-xl font-semibold">Staff sign in</h1>
        <p className="mt-1 text-sm text-muted">For project administrators, auditors and moderators. Residents do not need an account to submit or track a report.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {error && <ErrorBox message={error} />}
          <Field label="Email" required><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus /></Field>
          <Field label="Password" required><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
          <Button type="submit" busy={busy} className="w-full">Sign in</Button>
        </form>
      </Card>
    </div>
  );
}
