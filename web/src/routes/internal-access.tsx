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
import { useTranslation } from "react-i18next";

type Mode = "Admin" | "Super admin";

const MODES: Mode[] = ["Admin", "Super admin"];

const MODE_PORTAL: Record<Mode, PortalName> = {
  Admin: "admin",
  "Super admin": "super-admin",
};

const field = "mt-2 w-full border border-input bg-card px-4 py-3.5 outline-none transition-colors focus:border-gold";

export const Route = createFileRoute("/internal-access")({
  validateSearch: (search: Record<string, unknown>) => {
    const result: { next?: string; portal?: "admin" | "super-admin" } = {};
    if (typeof search["next"] === "string" && search["next"].startsWith("/")) result.next = search["next"];
    if (search["portal"] === "admin" || search["portal"] === "super-admin") result.portal = search["portal"];
    return result;
  },
  head: () => ({
    meta: [
      { title: "Staff access — Avencrestcorp" },
      { name: "description", content: "Restricted access." },
      { property: "og:title", content: "Staff access — Avencrestcorp" },
      { property: "og:description", content: "Restricted access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffLogin,
});

function StaffLogin() {
  const { login, status, user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(search.portal === "super-admin" ? "Super admin" : "Admin");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!email || !password) {
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
      const target = "/admin";
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
          <p className="eyebrow">Restricted access</p>
          <h1 className="mt-4 max-w-md text-5xl">Staff portal.</h1>
          <ul className="mt-8 space-y-3 text-sm text-navy-muted">
            <li>— Manage clients and investments</li>
            <li>— Review assignments and audit logs</li>
            <li>— Publish market prices</li>
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm animate-rise">
          <Lock className="size-6 text-gold" strokeWidth={1.5} />
          <h2 className="mt-6 text-4xl">{forgot ? "Reset your password" : "Staff sign in"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {forgot
              ? "We will email you a one-time link to set a new password."
              : "Use the credentials issued for your portal."}
          </p>
          <div className="mt-8">
            <Tabs value={mode} options={MODES} onChange={(value) => { setMode(value as Mode); setError(""); }} />
          </div>
          {error && (
            <p className="mt-6 border-l-2 border-destructive pl-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {!forgot ? (
            <form className="mt-6 space-y-5" onSubmit={submit} noValidate autoComplete="off">
              <div>
                <label htmlFor="email" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className={field}
                  autoComplete="off"
                  key={`email-${mode}`}
                />
              </div>
              <div>
                <label htmlFor="password" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={show ? "text" : "password"}
                    className={field}
                    autoComplete="new-password"
                    key={`password-${mode}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={submitting} className={buttonCls("navy") + " w-full justify-center"}>
                {submitting ? "Signing in…" : "Sign in"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setForgot(true);
                }}
                className="mt-4 w-full text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Forgot your password?
              </button>
            </form>
          ) : (
            <form className="mt-6 space-y-5" onSubmit={sendReset} noValidate>
              <div>
                <label htmlFor="forgot-email" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Email address
                </label>
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  className={field}
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className={buttonCls("navy") + " w-full justify-center"}>
                Send reset link
              </button>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setForgot(false);
                }}
                className="mt-4 w-full text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Back to sign in
              </button>
            </form>
          )}
          <p className="mt-10 text-xs text-muted-foreground">
            This portal is for authorised administrators only.
          </p>
        </div>
      </div>
    </section>
  );
}