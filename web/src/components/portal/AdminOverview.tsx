import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge, Panel, PageHeader, Stat } from "./kit";
import { useAdminDashboard } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import {
  commodityLabel,
  fmtDate,
  fmtDateTime,
  humanize,
  priceStatusLabel,
  usd,
} from "@/lib/format";

export function AdminOverview() {
  const { data, isPending, error } = useAdminDashboard();

  if (isPending) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="h-3 w-24 rounded bg-secondary/60" />
              <div className="mt-3 h-8 w-20 rounded bg-secondary/60" />
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
  if (error || !data) return <p className="text-sm text-destructive">{errorMessage(error)}</p>;

  const { metrics, definitions, scope } = data;
  const superAdmin = scope === "SYSTEM";

  return (
    <>
      <PageHeader eyebrow={superAdmin ? "Firm-wide view" : "Your client portfolio"} title="Administration overview">
        {superAdmin ? "Super administrator" : "Administrator"} · as of {fmtDateTime(data.asOf)}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Total clients" value={metrics.totalClients} hint={definitions["totalClients"]} />
        <Stat label="Active clients" value={metrics.activeClients} hint={definitions["activeClients"]} />
        <Stat
          label={superAdmin ? "Administrators" : "Unread items"}
          value={superAdmin ? metrics.totalAdmins : metrics.unreadItems}
          hint={superAdmin ? "Active administrator accounts" : definitions["unreadItems"]}
        />
        <Stat label="Investments" value={metrics.totalInvestments} />
        <Stat label="Assets under management" value={usd(metrics.aum, 0)} hint={definitions["aum"]} />
        <Stat label="Your unread notifications" value={metrics.unreadItems} />
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <Panel
          title="Recent transactions"
          action={
            <Link to="/admin/clients" className="text-xs font-semibold text-gold">
              Client accounts →
            </Link>
          }
        >
          {data.recentTransactions.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
          {data.recentTransactions.map((transaction) => (
            <div key={transaction.id} className="flex justify-between gap-3 border-b border-border py-4 last:border-0">
              <div>
                {transaction.client ? (
                  <Link
                    className="text-sm font-semibold hover:text-gold"
                    to="/admin/clients/$clientId"
                    params={{ clientId: transaction.client.id }}
                  >
                    {transaction.client.fullName}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold">—</span>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {humanize(transaction.type)} · {fmtDate(transaction.transactionDate)}
                  {transaction.investment ? ` · ${transaction.investment.name}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="mb-1 text-sm tabular-nums">{usd(transaction.amount)}</p>
                <Badge>{transaction.status}</Badge>
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Recently added clients">
          {data.recentlyAddedClients.length === 0 && <p className="text-sm text-muted-foreground">No client accounts yet.</p>}
          {data.recentlyAddedClients.map((client) => (
            <Link
              key={client.id}
              to="/admin/clients/$clientId"
              params={{ clientId: client.id }}
              className="flex justify-between gap-3 border-b border-border py-4 text-sm last:border-0 hover:text-gold"
            >
              <span>
                {client.firstName} {client.lastName}
                <span className="mt-1 block text-xs text-muted-foreground">{client.email}</span>
              </span>
              <span className="text-right">
                <Badge>{client.status}</Badge>
                <span className="mt-1 block text-xs text-muted-foreground">{fmtDate(client.createdAt)}</span>
              </span>
            </Link>
          ))}
        </Panel>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <Panel title="Upcoming maturities (90 days)">
          {data.upcomingMaturities.length === 0 && (
            <p className="text-sm text-muted-foreground">No investments mature in the next 90 days.</p>
          )}
          {data.upcomingMaturities.map((investment) => (
            <div key={investment.id} className="flex justify-between gap-3 border-b border-border py-4 text-sm last:border-0">
              <span>
                <span className="font-semibold">{investment.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {investment.client?.fullName ?? "—"} · {fmtDate(investment.maturityDate)}
                </span>
              </span>
              <span className="text-right">
                <span className="block tabular-nums">{usd(investment.projectedMaturityBalance, 0)}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{investment.daysRemaining} days</span>
              </span>
            </div>
          ))}
        </Panel>

        <Panel title="Recently updated investments">
          {data.recentInvestmentUpdates.length === 0 && (
            <p className="text-sm text-muted-foreground">No investment updates yet.</p>
          )}
          {data.recentInvestmentUpdates.map((investment) => (
            <div key={investment.id} className="flex justify-between gap-3 border-b border-border py-4 text-sm last:border-0">
              <span>
                <span className="font-semibold">{investment.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {investment.institution?.name ?? "—"} · {investment.client?.fullName ?? "—"}
                </span>
              </span>
              <span className="text-right">
                <span className="block tabular-nums">{usd(investment.currentPrincipal, 0)}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{fmtDate(investment.updatedAt)}</span>
              </span>
            </div>
          ))}
        </Panel>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <Panel title="Recent documents">
          {data.recentDocuments.length === 0 && <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>}
          {data.recentDocuments.map((document) => (
            <div key={document.id} className="flex justify-between gap-3 border-b border-border py-4 text-sm last:border-0">
              <span>
                <span className="font-semibold">{document.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {document.client?.fullName ?? "—"} · {fmtDate(document.uploadedAt)}
                </span>
              </span>
              <Badge>{document.category}</Badge>
            </div>
          ))}
        </Panel>

        <Panel title="Published prices">
          {data.prices.length === 0 && <p className="text-sm text-muted-foreground">Prices have not been published yet.</p>}
          {data.prices.map((price) => (
            <div key={price.id} className="flex justify-between gap-3 border-b border-border py-4 text-sm last:border-0">
              <span>
                <span className="font-semibold">{commodityLabel[price.commodity]}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {price.price === null ? "No price" : `per ${price.unit}`} ·{" "}
                  {price.lastPublishedAt ? fmtDateTime(price.lastPublishedAt) : "never published"}
                </span>
              </span>
              <span className="text-right">
                <span className="block tabular-nums">
                  {price.price === null ? "—" : `${usd(price.price, 2)} ${price.currency}`}
                </span>
                <span className="mt-1 block">
                  <Badge>{price.status}</Badge>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{priceStatusLabel[price.status]}</span>
              </span>
            </div>
          ))}
          <div className="mt-4">
            <Button variant="outline" asChild>
              <Link to="/admin/prices">Manage prices</Link>
            </Button>
          </div>
        </Panel>
      </div>

      {data.recentAudit.length > 0 && (
        <div className="mt-8">
          <Panel
            title="Latest audit events"
            action={
              <Link to="/admin/audit" className="text-xs font-semibold text-gold">
                Full audit log →
              </Link>
            }
          >
            {data.recentAudit.map((entry) => (
              <div key={entry.id} className="flex justify-between gap-3 border-b border-border py-3 text-sm last:border-0">
                <span>
                  <span className="font-semibold">{humanize(entry.action)}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {entry.actor?.fullName ?? "System"} · {fmtDateTime(entry.timestamp)}
                  </span>
                </span>
                <Badge>{entry.outcome}</Badge>
              </div>
            ))}
          </Panel>
        </div>
      )}
    </>
  );
}
