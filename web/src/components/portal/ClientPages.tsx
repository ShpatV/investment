import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Donut, F, input, Modal, PageHeader, Panel, Stat } from "./kit";
import { Investments, Transactions, Documents } from "./Records";
import { useAuth } from "@/lib/auth";
import {
  useChangePassword,
  useClientDashboard,
  useNews,
  useProfile,
  useSecurityQuestion,
  useUpdateProfile,
  useUpdateSecurityQuestion,
} from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { fmtDate, fmtDateTime, pct, signedAmount, transactionTypeLabel, usd } from "@/lib/format";
import office from "@/assets/office.jpg";

const errorText = (error: unknown) => errorMessage(error, "The request could not be completed.");

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What was your childhood nickname?",
  "What is your mother's maiden name?",
  "What was the make of your first car?",
];

export function ClientDashboard() {
  const dashboard = useClientDashboard();
  const news = useNews(4);
  const { user } = useAuth();

  if (dashboard.isPending) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="h-3 w-24 rounded bg-secondary/60" />
              <div className="mt-3 h-8 w-24 rounded bg-secondary/60" />
              <div className="mt-2 h-3 w-32 rounded bg-secondary/40" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="h-5 w-32 rounded bg-secondary/60" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="h-4 w-full rounded bg-secondary/40" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (dashboard.error || !dashboard.data) {
    return <p className="text-sm text-destructive">{errorText(dashboard.error)}</p>;
  }

  const { client, summary, allocation, planning, recentActivity } = dashboard.data;
  const advisor = user?.advisor ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Your account"
        title={`Welcome back, ${client.firstName}.`}
        actions={
          <Button variant="outline" asChild>
            <Link to="/portal/documents">
              Documents
              <ArrowRight />
            </Link>
          </Button>
        }
      >
        {client.firstName} {client.lastName} · Portfolio overview as of {fmtDate(dashboard.data.asOf)}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Projected maturity balance"
          value={usd(summary.projectedMaturityBalance, 0)}
          hint="Estimated · active investments"
        />
        <Stat
          label="Total invested"
          value={usd(summary.totalInvested, 0)}
          hint={`${summary.activeInvestments} active ${summary.activeInvestments === 1 ? "investment" : "investments"}`}
        />
        <Stat
          label="Projected return"
          value={usd(summary.projectedReturn, 0)}
          hint="Full contractual term · estimate"
        />
        <Stat
          label="Average annual rate"
          value={pct(summary.averageInterestRate)}
          hint="Principal-weighted"
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Allocation by institution">
          <Donut
            data={allocation.map((slice) => ({
              name: slice.institutionName,
              amount: slice.amount,
              pct: slice.percentage / 100,
            }))}
            format={(value) => usd(value, 0)}
          />
        </Panel>
        <section className="relative min-h-60 overflow-hidden bg-navy-deep p-7 text-navy-foreground">
          <img src={office} alt="Avencrestcorp office" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-veil" />
          <div className="relative">
            <p className="eyebrow">Your advisor</p>
            <h2 className="mt-4 text-3xl">{advisor?.fullName ?? "Not yet assigned"}</h2>
            <p className="mt-2 text-sm text-navy-muted">{advisor?.email ?? "Your account manager will be introduced shortly."}</p>
            <Button variant="outline" asChild className="mt-6 border-navy-muted bg-transparent text-navy-foreground">
              <Link to="/portal/profile">
                Account details
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </div>

      <div className="mt-8">
          <Panel
            title="Your holdings"
            action={
              <Link
                to="/portal/investments"
                className="text-xs font-semibold text-gold cursor-pointer hover:underline"
              >
                View all →
              </Link>
            }
          >
          <Investments />
        </Panel>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <Panel title="Maturity planning">
          {planning.timeline.length > 0 ? (
            <ol className="space-y-4">
              {planning.timeline.map((entry) => (
                <li key={entry.investmentId} className="flex items-start justify-between gap-4 border-b border-border pb-4 last:border-0 last:pb-0">
                  <span>
                    <span className="font-semibold">{entry.name}</span>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="size-3" />
                      {fmtDate(entry.maturityDate)} · {entry.daysRemaining} days remaining
                    </p>
                  </span>
                  <span className="text-right text-sm tabular-nums">{usd(entry.projectedMaturityBalance, 0)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No upcoming maturities.</p>
          )}
          <div className="mt-6 border-t border-border pt-5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estimated future balance</span>
              <span className="font-semibold tabular-nums">{usd(planning.estimatedFutureBalance, 0)}</span>
            </div>
            <div className="mt-2 flex justify-between">
              <span className="text-muted-foreground">Estimated earnings</span>
              <span className="font-semibold tabular-nums">{usd(planning.estimatedEarnings, 0)}</span>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{dashboard.data.assumptions.projectionDisclaimer}</p>
        </Panel>

        <Panel
          title="Recent activity"
          action={
            <Link
              to="/portal/transactions"
              className="text-xs font-semibold text-gold cursor-pointer hover:underline"
            >
              All transactions →
            </Link>
          }
        >
          {recentActivity.length > 0 ? (
            <ul className="space-y-4">
              {recentActivity.map((transaction) => (
                <li key={transaction.id} className="flex items-start justify-between gap-4 border-b border-border pb-4 last:border-0 last:pb-0">
                  <span>
                    <span className="text-sm font-semibold">{transactionTypeLabel[transaction.type]}</span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fmtDateTime(transaction.transactionDate)}
                      {transaction.investment ? ` · ${transaction.investment.name}` : ""}
                    </p>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm tabular-nums">{signedAmount(transaction.type, transaction.amount)}</span>
                    <span className="mt-1 inline-block">
                      <Badge>{transaction.status}</Badge>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No transactions recorded yet.</p>
          )}
        </Panel>
      </div>

      <div className="mt-8">
        <Panel title="Market headlines">
          {news.isPending && <p className="text-sm text-muted-foreground">Loading headlines…</p>}
          {news.error && (
            <p className="text-sm text-muted-foreground">Headlines are temporarily unavailable.</p>
          )}
          {news.data && news.data.status !== "ok" && news.data.status !== "stale" && (
            <p className="text-sm text-muted-foreground">
              {news.data.message ?? "Headlines are temporarily unavailable."}
            </p>
          )}
          {news.data && (news.data.status === "ok" || news.data.status === "stale") && (
            <ul className="grid gap-5 md:grid-cols-2">
              {news.data.articles.map((article) => (
                <li key={article.id} className="border-b border-border pb-4">
                  <a href={article.url} target="_blank" rel="noreferrer" className="font-semibold hover:text-gold">
                    {article.title}
                  </a>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {article.source} · {article.publishedAt ? fmtDateTime(article.publishedAt) : "Undated"}
                  </p>
                </li>
              ))}
              {news.data.articles.length === 0 && (
                <li className="text-sm text-muted-foreground">No headlines published yet.</li>
              )}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

export function ClientInvestments() {
  return (
    <>
      <PageHeader eyebrow="Portfolio" title="Investments">
        Investment terms managed by your advisor.
      </PageHeader>
      <Investments />
    </>
  );
}

export function ClientTransactions() {
  return (
    <>
      <PageHeader eyebrow="Account activity" title="Transactions" />
      <Transactions />
    </>
  );
}

export function ClientDocuments() {
  return (
    <>
      <PageHeader eyebrow="Your records" title="Documents">
        Upload identification or tax documents; statements and agreements are shared by your advisor.
      </PageHeader>
      <Documents />
    </>
  );
}

export function ClientProfile() {
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const updateSecurityQuestion = useUpdateSecurityQuestion();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);

  if (profile.isPending) {
    return <p className="text-sm text-muted-foreground">Loading your profile…</p>;
  }
  if (profile.error || !profile.data) {
    return <p className="text-sm text-destructive">{errorText(profile.error)}</p>;
  }

  const client = profile.data;
  const advisor = client.advisor;

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dateOfBirth = String(form.get("dateOfBirth") ?? "");
    const phone = String(form.get("phone") ?? "").trim();
    const address = String(form.get("address") ?? "").trim();
    try {
      await updateProfile.mutateAsync({
        firstName: String(form.get("firstName") ?? "").trim(),
        lastName: String(form.get("lastName") ?? "").trim(),
        ...(phone ? { phone } : {}),
        address: address || null,
        ...(dateOfBirth ? { dateOfBirth } : {}),
      });
      toast.success("Profile saved.");
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirm = String(form.get("confirmPassword") ?? "");
    if (newPassword !== confirm) {
      toast.error("The two passwords do not match.");
      return;
    }
    try {
      await changePassword.mutateAsync({
        currentPassword: String(form.get("currentPassword") ?? ""),
        newPassword,
      });
      toast.success("Password changed. Other sessions have been revoked.");
      setPasswordOpen(false);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const submitQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await updateSecurityQuestion.mutateAsync({
        securityQuestion: String(form.get("securityQuestion") ?? ""),
        securityAnswer: String(form.get("securityAnswer") ?? ""),
        currentPassword: String(form.get("currentPassword") ?? ""),
      });
      toast.success("Security question updated.");
      setQuestionOpen(false);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <>
      <PageHeader eyebrow="Account" title="Your profile" />
      <div className="grid gap-10 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Personal information">
          <form className="grid gap-5 sm:grid-cols-2" onSubmit={saveProfile}>
            <F label="First name">
              {(id) => <input id={id} name="firstName" className={input} defaultValue={client.firstName} required />}
            </F>
            <F label="Last name">
              {(id) => <input id={id} name="lastName" className={input} defaultValue={client.lastName} required />}
            </F>
            <F label="Phone">
              {(id) => <input id={id} name="phone" className={input} defaultValue={client.phone ?? ""} />}
            </F>
            <F label="Date of birth">
              {(id) => (
                <input id={id} name="dateOfBirth" type="date" className={input} defaultValue={client.dateOfBirth ?? ""} />
              )}
            </F>
            <F label="Address" className="sm:col-span-2">
              {(id) => <input id={id} name="address" className={input} defaultValue={client.address ?? ""} />}
            </F>
            <F label="Email">
              {(id) => <input id={id} className={input} value={client.email} readOnly />}
            </F>
            <div className="sm:col-span-2">
              <Button disabled={updateProfile.isPending}>
                {updateProfile.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </Panel>

        <div className="space-y-8">
          <Panel title="Account details">
            <dl className="space-y-4 text-sm">
              <div className="flex justify-between">
                <dt>Status</dt>
                <dd>
                  <Badge>{client.status}</Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Client since</dt>
                <dd>{fmtDate(client.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Assigned advisor</dt>
                <dd className="text-right">{advisor?.fullName ?? "Unassigned"}</dd>
              </div>
              {advisor?.email && (
                <div className="flex justify-between gap-4">
                  <dt>Advisor email</dt>
                  <dd className="text-right">{advisor.email}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt>Last sign-in</dt>
                <dd>{client.lastLoginAt ? fmtDateTime(client.lastLoginAt) : "—"}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Account security">
            <ShieldCheck className="size-7 text-gold" />
            <p className="my-4 text-sm text-muted-foreground">
              Keep your sign-in details private. Changing your password signs out every other session.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setPasswordOpen(true)}>
                Change password
              </Button>
              <Button variant="outline" onClick={() => setQuestionOpen(true)}>
                Security question
              </Button>
            </div>
          </Panel>
        </div>
      </div>

      <Modal open={passwordOpen} title="Change password" onClose={() => setPasswordOpen(false)}>
        <form className="space-y-4" onSubmit={submitPassword}>
          <F label="Current password">
            {(id) => <input id={id} name="currentPassword" type="password" autoComplete="current-password" className={input} required />}
          </F>
          <F label="New password">
            {(id) => <input id={id} name="newPassword" type="password" autoComplete="new-password" className={input} required minLength={10} />}
          </F>
          <F label="Confirm new password">
            {(id) => <input id={id} name="confirmPassword" type="password" autoComplete="new-password" className={input} required minLength={10} />}
          </F>
          <p className="text-xs text-muted-foreground">
            At least 10 characters, with an uppercase letter, a lowercase letter and a number.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPasswordOpen(false)}>
              Cancel
            </Button>
            <Button disabled={changePassword.isPending}>
              {changePassword.isPending ? "Saving…" : "Change password"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={questionOpen} title="Security question" onClose={() => setQuestionOpen(false)}>
        <SecurityQuestionForm
          onSubmit={submitQuestion}
          submitting={updateSecurityQuestion.isPending}
          onCancel={() => setQuestionOpen(false)}
        />
      </Modal>
    </>
  );
}

function SecurityQuestionForm({
  onSubmit,
  submitting,
  onCancel,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  onCancel: () => void;
}) {
  const current = useSecurityQuestion();

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <p className="text-sm text-muted-foreground">
        Current question: <span className="font-semibold text-foreground">{current.data?.securityQuestion ?? "Not set"}</span>
      </p>
      <F label="New question">
        {(id) => (
          <select id={id} name="securityQuestion" className={input} defaultValue={SECURITY_QUESTIONS[0]}>
            {SECURITY_QUESTIONS.map((question) => (
              <option key={question} value={question}>
                {question}
              </option>
            ))}
          </select>
        )}
      </F>
      <F label="Answer">
        {(id) => <input id={id} name="securityAnswer" className={input} required minLength={2} />}
      </F>
      <F label="Current password">
        {(id) => <input id={id} name="currentPassword" type="password" autoComplete="current-password" className={input} required />}
      </F>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={submitting}>{submitting ? "Saving…" : "Save question"}</Button>
      </div>
    </form>
  );
}

