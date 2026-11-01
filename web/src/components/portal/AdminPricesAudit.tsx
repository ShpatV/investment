import { useState, type FormEvent } from "react";
import { Eye, History, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, F, input, Modal, PageHeader, Pager, Panel, Table } from "./kit";
import {
  useAuditLogs,
  useClearPriceOverride,
  useOverridePrice,
  usePriceHistory,
  usePrices,
  useRefreshPrices,
} from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import {
  commodityLabel,
  fmtDateTime,
  humanize,
  priceStatusLabel,
  usd,
} from "@/lib/format";
import type {
  AuditEntry,
  AuditOutcome,
  Commodity,
  Price,
  PriceRefreshResult,
  Role,
} from "@/lib/api/types";

const AUDIT_PAGE_SIZE = 15;
const ROLES: Role[] = ["USER", "ADMIN", "SUPER_ADMIN"];
const OUTCOMES: AuditOutcome[] = ["SUCCESS", "FAILURE"];

const errorText = (error: unknown) => errorMessage(error, "The request could not be completed.");

/* ---------------------------------------------------------------- prices */

export function AdminPrices() {
  const { data, isPending, error } = usePrices();
  const refresh = useRefreshPrices();
  const clearOverride = useClearPriceOverride();
  const [overrideTarget, setOverrideTarget] = useState<Price | null>(null);
  const [clearTarget, setClearTarget] = useState<Price | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Commodity | null>(null);
  const [refreshResults, setRefreshResults] = useState<PriceRefreshResult[] | null>(null);

  const doRefresh = async () => {
    try {
      const result = await refresh.mutateAsync();
      setRefreshResults(result.results);
      const succeeded = result.results.filter((entry) => entry.success).length;
      if (succeeded === result.results.length) {
        toast.success(`Refreshed ${succeeded} of ${result.results.length} prices.`);
      } else {
        toast.warning(`Refreshed ${succeeded} of ${result.results.length} prices.`);
      }
    } catch (caught) {
      toast.error(errorText(caught));
    }
  };

  const confirmClear = async () => {
    if (!clearTarget) return;
    try {
      await clearOverride.mutateAsync(clearTarget.commodity);
      toast.success(`${commodityLabel[clearTarget.commodity]} override cleared.`);
      setClearTarget(null);
    } catch (caught) {
      toast.error(errorText(caught));
    }
  };

  if (isPending) return <p className="text-sm text-muted-foreground">Loading published prices…</p>;
  if (error || !data) return <p className="text-sm text-destructive">{errorText(error)}</p>;

  const canOverride = data.canOverride;

  return (
    <>
      <PageHeader
        eyebrow="Market reference"
        title="Published prices"
        actions={
          <Button variant="outline" onClick={() => void doRefresh()} disabled={refresh.isPending}>
            <RefreshCw />
            {refresh.isPending ? "Refreshing…" : "Refresh from provider"}
          </Button>
        }
      >
        Provider: {data.primaryProvider} · stale after {data.staleAfterMinutes} minutes
        {!canOverride && " · price overrides are disabled for your account"}
      </PageHeader>

      {data.notes && <p className="mb-6 text-xs text-muted-foreground">{data.notes}</p>}

      {refreshResults && (
        <Panel title="Last refresh result" className="mb-8">
          <ul className="space-y-2 text-sm">
            {refreshResults.map((entry) => (
              <li key={entry.commodity} className="flex justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="font-semibold">{commodityLabel[entry.commodity]}</span>
                {entry.success ? (
                  <span className="text-right tabular-nums">
                    {entry.price === undefined ? "—" : usd(entry.price)}
                    <span className="ml-2 text-xs text-muted-foreground">via {entry.provider ?? "provider"}</span>
                  </span>
                ) : (
                  <span className="text-right text-xs text-destructive">{entry.error ?? "Refresh failed"}</span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-8 xl:grid-cols-2">
        {data.prices.map((price) => (
          <section key={price.id} className="min-w-0 border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">{price.commodity === "GOLD" ? "Precious metals" : "Energy"}</p>
                <h2 className="mt-2 text-4xl">{commodityLabel[price.commodity]}</h2>
              </div>
              <div className="text-right">
                <Badge>{price.status}</Badge>
                <p className="mt-1 text-xs text-muted-foreground">{priceStatusLabel[price.status]}</p>
              </div>
            </div>

            <p className="mt-7 font-display text-5xl tabular-nums">{usd(price.price)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              USD / {price.unit} · source {humanize(price.source)}
            </p>

            <dl className="mt-6 space-y-3 text-xs">
              <Row label="Provider price" value={usd(price.providerPrice)} />
              <Row label="Provider" value={price.provider || "—"} />
              <Row label="Provider fetched" value={fmtDateTime(price.providerFetchedAt)} />
              <Row label="Last published" value={fmtDateTime(price.lastPublishedAt)} />
              {price.manualOverridePrice !== null && (
                <>
                  <Row label="Override price" value={usd(price.manualOverridePrice)} />
                  <Row label="Override starts" value={fmtDateTime(price.overrideStartsAt)} />
                  <Row
                    label="Override expires"
                    value={price.overrideEndsAt ? fmtDateTime(price.overrideEndsAt) : "No expiration"}
                  />
                  {price.overrideReason && (
                    <p className="border-t border-border pt-3 text-muted-foreground">{price.overrideReason}</p>
                  )}
                </>
              )}
            </dl>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setHistoryTarget(price.commodity)}>
                <History />
                History
              </Button>
              {canOverride && (
                <Button onClick={() => setOverrideTarget(price)}>
                  <Pencil />
                  Set override
                </Button>
              )}
              {canOverride && price.manualOverridePrice !== null && (
                <Button variant="outline" onClick={() => setClearTarget(price)}>
                  <Trash2 />
                  Clear override
                </Button>
              )}
            </div>
          </section>
        ))}
        {data.prices.length === 0 && (
          <p className="text-sm text-muted-foreground">No price rows have been created yet.</p>
        )}
      </div>

      {overrideTarget && (
        <OverrideForm price={overrideTarget} onClose={() => setOverrideTarget(null)} />
      )}

      <Modal open={Boolean(clearTarget)} title="Clear manual override" onClose={() => setClearTarget(null)}>
        <p className="text-sm text-muted-foreground">
          Clearing the override restores the provider price for{" "}
          <span className="font-semibold text-foreground">
            {clearTarget ? commodityLabel[clearTarget.commodity] : "this commodity"}
          </span>
          . The override history is retained in the audit log.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setClearTarget(null)}>
            Cancel
          </Button>
          <Button onClick={() => void confirmClear()} disabled={clearOverride.isPending}>
            {clearOverride.isPending ? "Clearing…" : "Clear override"}
          </Button>
        </div>
      </Modal>

      {historyTarget && <PriceHistoryModal commodity={historyTarget} onClose={() => setHistoryTarget(null)} />}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function OverrideForm({ price, onClose }: { price: Price; onClose: () => void }) {
  const override = useOverridePrice();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startsAt = toIso(String(form.get("startsAt") ?? ""));
    const endsAt = toIso(String(form.get("endsAt") ?? ""));
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      toast.error("The expiration must be after the effective date.");
      return;
    }
    try {
      await override.mutateAsync({
        commodity: price.commodity,
        input: {
          price: String(form.get("price") ?? ""),
          reason: String(form.get("reason") ?? "").trim(),
          ...(startsAt ? { startsAt } : {}),
          ...(endsAt ? { endsAt } : {}),
        },
      });
      toast.success(`${commodityLabel[price.commodity]} price overridden.`);
      onClose();
    } catch (caught) {
      toast.error(errorText(caught));
    }
  };

  return (
    <Modal open title={`Manual override · ${commodityLabel[price.commodity]}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <p className="text-xs text-muted-foreground">
          Published price is informational only; overrides never change contractual investment terms.
        </p>
        <F label={`Price (USD per ${price.unit})`}>
          {(id) => (
            <input
              id={id}
              name="price"
              type="number"
              min="0.0001"
              step="0.0001"
              className={input}
              defaultValue={price.price ?? ""}
              required
            />
          )}
        </F>
        <F label="Reason">
          {(id) => (
            <textarea
              id={id}
              name="reason"
              className={input}
              rows={3}
              minLength={3}
              maxLength={1000}
              required
            />
          )}
        </F>
        <div className="grid gap-4 sm:grid-cols-2">
          <F label="Effective from (optional)">
            {(id) => <input id={id} name="startsAt" type="datetime-local" className={input} />}
          </F>
          <F label="Expires (optional)">
            {(id) => <input id={id} name="endsAt" type="datetime-local" className={input} />}
          </F>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={override.isPending}>
            {override.isPending ? "Saving…" : "Publish override"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PriceHistoryModal({ commodity, onClose }: { commodity: Commodity; onClose: () => void }) {
  const { data, isPending, error } = usePriceHistory(commodity);

  return (
    <Modal open title={`${commodityLabel[commodity]} price history`} onClose={onClose}>
      {isPending && <p className="text-sm text-muted-foreground">Loading history…</p>}
      {error && <p className="text-sm text-destructive">{errorText(error)}</p>}
      {data && (
        <div className="space-y-8">
          <div>
            <h3 className="text-xl">Manual overrides</h3>
            <div className="mt-3">
              <Table
                head={["Created", "Previous", "New", "Reason", "Window", "By"]}
                empty={data.overrides.length === 0}
              >
                {data.overrides.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(entry.createdAt)}</td>
                    <td className="tabular-nums">{usd(entry.previousPrice)}</td>
                    <td className="tabular-nums">{usd(entry.newPrice)}</td>
                    <td className="max-w-56 text-xs text-muted-foreground">{entry.reason}</td>
                    <td className="text-xs">
                      {fmtDateTime(entry.startsAt)} → {entry.endsAt ? fmtDateTime(entry.endsAt) : "no expiry"}
                      {entry.clearedAt && (
                        <p className="mt-1 text-muted-foreground">Cleared {fmtDateTime(entry.clearedAt)}</p>
                      )}
                    </td>
                    <td>{entry.createdBy?.fullName ?? "System"}</td>
                  </tr>
                ))}
              </Table>
            </div>
          </div>

          <div>
            <h3 className="text-xl">Provider snapshots</h3>
            <div className="mt-3">
              <Table head={["Fetched", "Price", "Provider"]} empty={data.snapshots.length === 0}>
                {data.snapshots.map((snapshot) => (
                  <tr key={snapshot.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(snapshot.fetchedAt)}</td>
                    <td className="tabular-nums">
                      {usd(snapshot.price)} <span className="text-xs text-muted-foreground">/ {snapshot.unit}</span>
                    </td>
                    <td>{snapshot.provider}</td>
                  </tr>
                ))}
              </Table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ----------------------------------------------------------------- audit */

export function AdminAudit() {
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [outcome, setOutcome] = useState<AuditOutcome | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const audit = useAuditLogs({
    page,
    pageSize: AUDIT_PAGE_SIZE,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(entityType.trim() ? { entityType: entityType.trim() } : {}),
    ...(role ? { actorRole: role } : {}),
    ...(outcome ? { outcome } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });

  const rows = audit.data?.data ?? [];
  const totalPages = audit.data?.pagination.totalPages ?? 1;
  const reset = (update: () => void) => {
    update();
    setPage(1);
  };

  return (
    <>
      <PageHeader eyebrow="Administrative history" title="Audit log">
        Read-only record of administrative and financial activity.
      </PageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <input
          aria-label="Search audit log"
          className={`${input} xl:col-span-2`}
          placeholder="Search action, entity or summary"
          value={search}
          onChange={(event) => reset(() => setSearch(event.target.value))}
        />
        <input
          aria-label="Audit entity type"
          className={input}
          placeholder="Entity type (e.g. USER)"
          value={entityType}
          onChange={(event) => reset(() => setEntityType(event.target.value))}
        />
        <select
          aria-label="Audit actor role"
          className={input}
          value={role}
          onChange={(event) => reset(() => setRole(event.target.value as Role | ""))}
        >
          <option value="">All roles</option>
          {ROLES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </select>
        <select
          aria-label="Audit outcome"
          className={input}
          value={outcome}
          onChange={(event) => reset(() => setOutcome(event.target.value as AuditOutcome | ""))}
        >
          <option value="">All outcomes</option>
          {OUTCOMES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </select>
        <F label="From">
          {(id) => (
            <input
              id={id}
              className={input}
              type="date"
              value={from}
              onChange={(event) => reset(() => setFrom(event.target.value))}
            />
          )}
        </F>
        <F label="To">
          {(id) => (
            <input
              id={id}
              className={input}
              type="date"
              value={to}
              onChange={(event) => reset(() => setTo(event.target.value))}
            />
          )}
        </F>
      </div>

      {audit.error && <p className="mb-4 text-sm text-destructive">{errorText(audit.error)}</p>}

      <Table
        head={["Event / time", "Actor", "Action", "Entity", "Summary", "Outcome", ""]}
        empty={!audit.isPending && rows.length === 0}
      loading={audit.isPending}
      >
        {rows.map((entry) => (
          <tr key={entry.id}>
            <td className="whitespace-nowrap">
              <span className="font-mono text-xs">#{entry.id}</span>
              <p className="text-xs text-muted-foreground">{fmtDateTime(entry.timestamp)}</p>
            </td>
            <td>
              {entry.actor?.fullName ?? "System"}
              <p className="text-xs text-muted-foreground">{entry.actor?.email ?? entry.actorRole ?? "—"}</p>
            </td>
            <td>{humanize(entry.action)}</td>
            <td>
              {humanize(entry.entityType)}
              <p className="max-w-40 truncate text-xs text-muted-foreground">{entry.entityId ?? "—"}</p>
            </td>
            <td className="max-w-72 text-xs text-muted-foreground">{entry.summary ?? "—"}</td>
            <td>
              <Badge>{entry.outcome}</Badge>
            </td>
            <td>
              <Button variant="ghost" size="icon" aria-label="View audit entry" onClick={() => setSelected(entry)}>
                <Eye />
              </Button>
            </td>
          </tr>
        ))}
      </Table>
      {audit.isPending && <p className="mt-4 text-sm text-muted-foreground">Loading audit history…</p>}
      <Pager page={page} pages={totalPages} onPage={setPage} />

      <Modal open={Boolean(selected)} title="Audit event" onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-5 text-sm">
            <dl className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["Event", `#${selected.id}`],
                  ["When", fmtDateTime(selected.timestamp)],
                  ["Actor", selected.actor?.fullName ?? "System"],
                  ["Actor email", selected.actor?.email ?? "—"],
                  ["Role", selected.actorRole ? humanize(selected.actorRole) : "—"],
                  ["Action", humanize(selected.action)],
                  ["Entity", humanize(selected.entityType)],
                  ["Entity id", selected.entityId ?? "—"],
                  ["Client id", selected.clientId ?? "—"],
                  ["Outcome", humanize(selected.outcome)],
                  ["IP address", selected.ipAddress ?? "—"],
                ] as Array<[string, string]>
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-all font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            {selected.summary && <p className="text-muted-foreground">{selected.summary}</p>}
            <JsonBlock title="Before" value={selected.beforeData} />
            <JsonBlock title="After" value={selected.afterData} />
          </div>
        )}
      </Modal>
    </>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <pre className="mt-2 max-h-56 overflow-auto border border-border bg-secondary/50 p-3 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
