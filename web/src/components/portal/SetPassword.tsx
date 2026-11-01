import { Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonCls } from "@/components/site/ui";
import { authApi } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";

const field = "mt-2 w-full border border-input bg-card px-4 py-3.5 outline-none transition-colors focus:border-gold";

const RULES: Array<{ label: string; test: (value: string) => boolean }> = [
  { label: "At least 10 characters", test: (value) => value.length >= 10 && value.length <= 128 },
  { label: "One lowercase letter", test: (value) => /[a-z]/.test(value) },
  { label: "One uppercase letter", test: (value) => /[A-Z]/.test(value) },
  { label: "One number", test: (value) => /[0-9]/.test(value) },
];

export function SetPasswordForm({
  token,
  kind,
}: {
  token: string;
  kind: "invitation" | "reset";
}) {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!RULES.every((rule) => rule.test(password))) {
      setError("Your password does not meet the requirements below.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const result = await authApi.resetPassword({ token, newPassword: password });
      toast.success(result.message);
      setDone(true);
    } catch (caught) {
      setError(errorMessage(caught, "This link may be invalid or expired."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <KeyRound className="mx-auto size-6 text-gold" strokeWidth={1.5} />
        <h1 className="mt-6 text-4xl">Link incomplete</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This page needs a one-time token. Open the link from your email, or request a new one.
        </p>
        <Button asChild className={`${buttonCls("navy")} mt-8`}>
          <Link to="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <CheckCircle2 className="mx-auto size-8 text-positive" strokeWidth={1.5} />
        <h1 className="mt-6 text-4xl">Password set</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your new password is active. Sign in to continue.
        </p>
        <Button asChild className={`${buttonCls("gold")} mt-8`}>
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-24">
      <KeyRound className="size-6 text-gold" strokeWidth={1.5} />
      <h1 className="mt-6 text-4xl">{kind === "invitation" ? "Welcome to Corestone" : "Set a new password"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {kind === "invitation"
          ? "Choose a password to activate your account."
          : "Choose a new password for your account."}
      </p>
      <form onSubmit={submit} noValidate className="mt-10">
        <label className="block text-sm font-medium" htmlFor="new-password">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          className={field}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <label className="mt-6 block text-sm font-medium" htmlFor="confirm-password">
          Confirm password
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          className={field}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        <ul className="mt-5 space-y-1.5 text-xs">
          {RULES.map((rule) => {
            const ok = rule.test(password);
            return (
              <li key={rule.label} className={ok ? "text-positive" : "text-muted-foreground"}>
                {ok ? "✓" : "·"} {rule.label}
              </li>
            );
          })}
        </ul>
        {error && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button className={`${buttonCls("navy")} mt-8 w-full`} disabled={submitting}>
          {submitting ? "Saving…" : "Set password"}
        </Button>
        <button
          type="button"
          onClick={() => void navigate({ to: "/login" })}
          className="mt-4 w-full text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        >
          Back to sign in
        </button>
      </form>
    </div>
  );
}
