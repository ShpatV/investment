import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import hero from "@/assets/hero.jpg";
import { buttonCls } from "@/components/site/ui";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/portal/kit";
import { useAuth } from "@/lib/auth";
import { errorMessage, type PortalName } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints";

type Mode = "Client" | "Admin" | "Super admin";

const MODES: Mode[] = ["Client", "Admin", "Super admin"];

const MODE_PORTAL: Record<Mode, PortalName> = {
  Client: "client",
  Admin: "admin",
  "Super admin": "super-admin",
};

const field = "mt-2 w-full border border-input bg-card px-4 py-3.5 outline-none transition-colors focus:border-gold";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => {
    const result: { next?: string; portal?: "client" | "admin" | "super-admin" } = {};
    if (typeof search["next"] === "string" && search["next"].startsWith("/")) result.next = search["next"];
    if (search["portal"] === "client" || search["portal"] === "admin" || search["portal"] === "super-admin") result.portal = search["portal"];
    return result;
  },
  head: () => ({
    meta: [
      { title: "Sign in — Avencrestcorp" },
      {
        name: "description",
        content: "Sign in to keep your documents, activity and portfolio in one place.",
      },
      { property: "og:title", content: "Sign in — Avencrestcorp" },
      { property: "og:description", content: "A familiar place to return to." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Login,
});

function Login() {
  const { login, status, user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(search.portal === 'super-admin' ? 'Super admin' : search.portal === 'admin' ? 'Admin' : 'Client');
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  // Never auto-redirect from the login page. The user must explicitly
  // submit the form. This prevents "Welcome back" toasts from appearing
  // when switching tabs without entering credentials.
  // (No auto-redirect logic here.)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!email || !password) {
      // Silently ignore empty submissions (e.g. from browser autofill)
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 1) {
      setError("Enter your email address and password.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const signedIn = await login(MODE_PORTAL[mode], email, password);
      toast.success(`Welcome back, ${signedIn.firstName}.`);
      const target = mode === "Client" ? "/portal" : "/admin";
      await navigate({ to: target, replace: true });
    } catch (caught) {
      setError(errorMessage(caught, "Sign in failed. Check your details and try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const sendReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(forgotEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    try {
      const result = await authApi.forgotPassword(forgotEmail);
      toast.success(result.message);
      if (result.devToken) {
        void navigate({ to: "/reset-password", search: { token: result.devToken } });
      } else {
        setForgot(false);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <section className="grid min-h-screen pt-20 md:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-navy-deep text-navy-foreground md:block">
        <img
          src={hero}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-60"
          width={1920}
          height={1088}
        />
        <div className="absolute inset-0 bg-fade" />
        <div className="absolute bottom-0 p-14">
          <p className="eyebrow">Secure area</p>
          <h1 className="mt-4 max-w-md text-5xl">A familiar place to return to.</h1>
          <ul className="mt-8 space-y-3 text-sm text-navy-muted">
            <li>— Documents, without the search</li>
            <li>— Activity with context</li>
            <li>— Your advisor, one message away</li>
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm animate-rise">
          <Lock className="size-6 text-gold" strokeWidth={1.5} />
          <h2 className="mt-6 text-4xl">{forgot ? "Reset your password" : "Sign in"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {forgot
              ? "We will email you a one-time link to set a new password."
              : "Use the credentials issued for your portal."}
          </p>

          {forgot ? (
            <form onSubmit={sendReset} noValidate className="mt-8">
              <label className="block text-sm font-medium" htmlFor="reset-email">
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                autoComplete="off"
                className={field}
                value={forgotEmail}
                onChange={(event) => setForgotEmail(event.target.value)}
              />
              {error && (
                <p className="mt-4 text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button className={`${buttonCls("navy")} mt-8 w-full`}>Send reset link</Button>
              <button
                type="button"
                onClick={() => {
                  setForgot(false);
                  setError("");
                }}
                className="mt-4 w-full text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Back to sign in
              </button>
            </form>
          ) : (
            <form onSubmit={submit} noValidate autoComplete="off">
              <div className="mt-8">
                <Tabs value={mode} options={MODES} onChange={(value) => { setMode(value as Mode); setError(""); }} />
              </div>
              <label className="mt-8 block text-sm font-medium" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="off"
                className={field}
                defaultValue=""
                key={`email-${mode}`}
              />
              <label className="mt-6 block text-sm font-medium" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  className={field}
                  defaultValue=""
                  key={`password-${mode}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 mt-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
              {error && (
                <p className="mt-4 text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button className={`${buttonCls("navy")} mt-8 w-full`} disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
                {!submitting && <ArrowRight />}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setForgot(true);
                  setError("");
                }}
                className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Mail className="size-3.5" />
                Forgot password
              </button>
              {import.meta.env.DEV && (
                <p className="mt-8 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
                  Development shortcuts: client@example.com · admin@example.com · superadmin@example.com.
                  Passwords come from the backend seed.
                </p>
              )}
            </form>
          )}

          <p className="mt-8 text-sm text-muted-foreground">
            No account yet?{" "}
            <Link to="/kontakt" className="font-semibold text-foreground link-underline">
              Start with a conversation
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

function defaultEmailForMode(mode: Mode): string {
  if (mode === "Super admin") return "superadmin@example.com";
  if (mode === "Admin") return "admin@example.com";
  return "client@example.com";
}

function defaultPasswordForMode(mode: Mode): string {
  if (mode === "Super admin") return "SuperAdmin123!";
  if (mode === "Admin") return "Admin1234!";
  return "Client1234!";
}

