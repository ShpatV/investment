import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Eye, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Donut,
  FilterBar,
  FilterField,
  FilterInput,
  FilterSelect,
  Modal,
  PageHeader,
  Pager,
  Panel,
  Stat,
  Table,
  Tabs,
} from "./kit";
import { ClientForm } from "./ClientForm";
import { Documents, Investments, Transactions } from "./Records";
import { useAuth } from "@/lib/auth";
import {
  useAdmins,
  useAssignments,
  useAuditLogs,
  useClient,
  useClients,
  useInviteClient,
  useRemoveAssignment,
  useToggleClient,
} from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import {
  clientName,
  fmtDate,
  fmtDateTime,
  humanize,
  signedAmount,
  usd,
  userStatusLabel,
} from "@/lib/format";
import type { ClientListItem, UserStatus } from "@/lib/api/types";

const PAGE_SIZE = 10;

const errorText = (error: unknown) => errorMessage(error, "The request could not be completed.");

export function AdminClients() {
  const { user } = useAuth();
  const superAdmin = user?.role === "SUPER_ADMIN";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [adminFilter, setAdminFilter] = useState("");
  const [page, setPage] = useState(1);
  const [add, setAdd] = useState(false);
  const [editing, setEditing] = useState<ClientListItem | null>(null);
  const [toggleTarget, setToggleTarget] = useState<ClientListItem | null>(null);
  const [invite, setInvite] = useState<{ name: string; token: string } | null>(null);

  const clients = useClients({
    page,
    pageSize: PAGE_SIZE,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(status ? { status } : {}),
    ...(adminFilter ? { adminId: adminFilter } : {}),
  });
  const admins = useAdmins({ pageSize: 100, status: "ACTIVE", role: "ADMIN" });
  const toggle = useToggleClient();
  const inviteClient = useInviteClient();

  const rows = clients.data?.data ?? [];
  const totalPages = clients.data?.pagination.totalPages ?? 1;
  const reset = (update: () => void) => {
    update();
    setPage(1);
  };

  const confirmToggle = async () => {
    if (!toggleTarget) return;
    try {
      await toggle.mutateAsync({
        id: toggleTarget.id,
        action: toggleTarget.status === "ACTIVE" ? "disable" : "reactivate",
      });
      toast.success(toggleTarget.status === "ACTIVE" ? "Client disabled." : "Client reactivated.");
      setToggleTarget(null);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const sendInvite = async (client: ClientListItem) => {
    try {
      const result = await inviteClient.mutateAsync(client.id);
      if (result.token) {
        setInvite({ name: clientName(client), token: result.token });
      } else {
        toast.success(`Invitation sent to ${client.email}.`);
      }
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={superAdmin ? "All accounts" : "Assigned accounts"}
        title="Clients"
        actions={
          <Button onClick={() => setAdd(true)}>
            <Plus />
            Add client
          </Button>
        }
      />

      <FilterBar>
        <FilterField label="Search">
          <FilterInput
            value={search}
            onChange={(value) => reset(() => setSearch(value))}
            placeholder="Search name or email"
          />
        </FilterField>
        <FilterField label="Status">
          <FilterSelect
            value={status}
            onChange={(value) => reset(() => setStatus(value as UserStatus | ""))}
            options={[
              { label: "Active", value: "ACTIVE" },
              { label: "Disabled", value: "DISABLED" },
            ]}
          />
        </FilterField>
        {superAdmin && (
          <FilterField label="Assigned administrator">
            <FilterSelect
              value={adminFilter}
              onChange={(value) => reset(() => setAdminFilter(value))}
              options={(admins.data?.data ?? []).map((admin) => ({
                label: admin.fullName,
                value: admin.id,
              }))}
            />
          </FilterField>
        )}
      </FilterBar>

      {clients.error && <p className="mb-4 text-sm text-destructive">{errorText(clients.error)}</p>}

      <Table
        head={["Client", "Status", "Administrator", "Active principal", "Investments", "Last activity", "Actions"]}
        empty={!clients.isPending && rows.length === 0}
      loading={clients.isPending}
      >
        {rows.map((client) => (
          <tr key={client.id}>
            <td>
              <p className="font-semibold">{clientName(client)}</p>
              <p className="text-xs text-muted-foreground">{client.email}</p>
              {client.phone && <p className="text-xs text-muted-foreground">{client.phone}</p>}
            </td>
            <td>
              <Badge>{client.status}</Badge>
            </td>
            <td>{client.assignedAdmin?.fullName ?? "Unassigned"}</td>
            <td className="tabular-nums">{usd(client.totalInvestedPrincipal, 0)}</td>
            <td>{client.investmentCount}</td>
            <td>{client.lastActivityAt ? fmtDate(client.lastActivityAt) : "—"}</td>
            <td>
              <div className="flex flex-wrap items-center">
                <Button variant="ghost" size="icon" asChild>
                  <Link
                    to="/admin/clients/$clientId"
                    params={{ clientId: client.id }}
                    aria-label={`View ${clientName(client)}`}
                  >
                    <Eye />
                  </Link>
                </Button>
                <Button variant="link" onClick={() => setEditing(client)}>
                  Edit
                </Button>
                <Button variant="link" onClick={() => void sendInvite(client)} disabled={inviteClient.isPending}>
                  Invite
                </Button>
                <Button variant="link" onClick={() => setToggleTarget(client)}>
                  {client.status === "ACTIVE" ? "Disable" : "Reactivate"}
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {clients.isPending && <p className="mt-4 text-sm text-muted-foreground">Loading clients…</p>}
      <Pager page={page} pages={totalPages} onPage={setPage} />

      <ClientForm open={add} onClose={() => setAdd(false)} />
      {editing && <ClientForm open onClose={() => setEditing(null)} client={editing} />}

      <Modal open={Boolean(toggleTarget)} title="Confirm account change" onClose={() => setToggleTarget(null)}>
        <p className="text-sm text-muted-foreground">
          {toggleTarget?.status === "ACTIVE"
            ? `Disabling ${clientName(toggleTarget)} signs them out immediately and blocks future sign-ins. Their data is retained.`
            : `Reactivating ${toggleTarget ? clientName(toggleTarget) : "this client"} restores access with the same password.`}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setToggleTarget(null)}>
            Cancel
          </Button>
          <Button onClick={() => void confirmToggle()} disabled={toggle.isPending}>
            {toggle.isPending ? "Saving…" : "Confirm"}
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(invite)} title="Invitation link" onClose={() => setInvite(null)}>
        {invite && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Send this one-time link to {invite.name}. It expires in seven days.
            </p>
            <code className="block break-all border border-border bg-secondary/50 p-3 text-xs">
              /accept-invitation?token={invite.token}
            </code>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/accept-invitation" search={{ token: invite.token }}>
                  Open link
                </Link>
              </Button>
              <Button
                onClick={() => {
                  void navigator.clipboard?.writeText(
                    `${window.location.origin}/accept-invitation?token=${encodeURIComponent(invite.token)}`,
                  );
                  toast.success("Link copied.");
                }}
              >
                Copy link
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

const DETAIL_TABS = [
  "Overview",
  "Personal information",
  "Investments",
  "Transactions",
  "Documents",
  "Assignments",
  "Activity",
] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

export function AdminClientDetail({ clientId }: { clientId: string }) {
  const [tab, setTab] = useState<DetailTab>("Overview");
  const [edit, setEdit] = useState(false);
  const client = useClient(clientId);
  const assignments = useAssignments({ clientId, pageSize: 20 });
  const audit = useAuditLogs({ clientId, pageSize: 20 });
  const removeAssignment = useRemoveAssignment();

  if (client.isPending) return <p className="text-sm text-muted-foreground">Loading client…</p>;
  if (client.error || !client.data) return <p className="text-sm text-destructive">{errorText(client.error)}</p>;

  const detail = client.data;
  const summary = detail.portfolioSummary;

  const remove = async (id: string) => {
    try {
      await removeAssignment.mutateAsync(id);
      toast.success("Assignment removed.");
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <>
      <Link to="/admin/clients" className="mb-5 inline-flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowLeft className="size-3" />
        Clients
      </Link>
      <PageHeader
        eyebrow={detail.id}
        title={clientName(detail)}
        actions={
          <Button variant="outline" onClick={() => setEdit(true)}>
            Edit client
          </Button>
        }
      >
        {detail.email}
        {detail.phone ? ` · ${detail.phone}` : ""}
      </PageHeader>

      <Tabs value={tab} options={DETAIL_TABS} onChange={setTab} />

      <div className="mt-7">
        {tab === "Overview" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Total invested" value={usd(summary.totalInvested, 0)} />
              <Stat
                label="Projected balance"
                value={usd(summary.projectedMaturityBalance, 0)}
                hint="Estimate · active investments"
              />
              <Stat label="Projected return" value={usd(summary.projectedReturn, 0)} />
              <Stat label="Investments" value={detail.investments.length} />
            </div>
            <div className="mt-8 grid gap-8 xl:grid-cols-2">
              <Panel title="Institution allocation">
                <Donut
                  data={summary.allocation.map((slice) => ({
                    name: slice.institutionName,
                    amount: slice.amount,
                    pct: slice.percentage / 100,
                  }))}
                  format={(value) => usd(value, 0)}
                />
              </Panel>
              <Panel title="Client account">
                <p className="mb-3">
                  <Badge>{detail.status}</Badge>
                </p>
                <p className="text-sm">{detail.address ?? "No address recorded"}</p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Advisor: {detail.advisor?.fullName ?? "Unassigned"}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Client since {fmtDate(detail.createdAt)}
                </p>
              </Panel>
            </div>
            <div className="mt-8 grid gap-8 xl:grid-cols-2">
              <Panel title="Recent transactions">
                {detail.recentTransactions.length === 0 && (
                  <p className="text-sm text-muted-foreground">No transactions recorded.</p>
                )}
                {detail.recentTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex justify-between gap-3 border-b border-border py-3 text-sm last:border-0">
                    <span>
                      <span className="font-semibold">{humanize(transaction.type)}</span>
                      <p className="mt-1 text-xs text-muted-foreground">{fmtDate(transaction.transactionDate)}</p>
                    </span>
                    <span className="text-right">
                      <span className="block tabular-nums">{signedAmount(transaction.type, transaction.amount)}</span>
                      <span className="mt-1 block">
                        <Badge>{transaction.status}</Badge>
                      </span>
                    </span>
                  </div>
                ))}
              </Panel>
              <Panel title="Recent documents">
                {detail.recentDocuments.length === 0 && (
                  <p className="text-sm text-muted-foreground">No documents uploaded.</p>
                )}
                {detail.recentDocuments.map((document) => (
                  <div key={document.id} className="flex justify-between gap-3 border-b border-border py-3 text-sm last:border-0">
                    <span>
                      <span className="font-semibold">{document.title}</span>
                      <p className="mt-1 text-xs text-muted-foreground">{fmtDate(document.uploadedAt)}</p>
                    </span>
                    <Badge>{document.category}</Badge>
                  </div>
                ))}
              </Panel>
            </div>
          </>
        )}

        {tab === "Personal information" && (
          <Panel title="Personal information">
            <dl className="grid gap-5 text-sm sm:grid-cols-2">
              {(
                [
                  ["Name", clientName(detail)],
                  ["Email", detail.email],
                  ["Phone", detail.phone ?? "—"],
                  ["Address", detail.address ?? "—"],
                  ["Date of birth", detail.dateOfBirth ? fmtDate(detail.dateOfBirth) : "Not provided"],
                  ["Status", userStatusLabel[detail.status]],
                  ["Created", fmtDate(detail.createdAt)],
                  ["Last sign-in", detail.lastLoginAt ? fmtDateTime(detail.lastLoginAt) : "—"],
                  ["Advisor", detail.advisor?.fullName ?? "Unassigned"],
                ] as Array<[string, string]>
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        )}

        {tab === "Investments" && <Investments clientId={clientId} editable />}
        {tab === "Transactions" && <Transactions clientId={clientId} editable />}
        {tab === "Documents" && <Documents clientId={clientId} editable />}

        {tab === "Assignments" && (
          <Table head={["Administrator", "Status", "Assigned", "Ended", "Notes", ""]} empty={!assignments.isPending && (assignments.data?.data.length ?? 0) === 0} loading={assignments.isPending}>
            {(assignments.data?.data ?? []).map((assignment) => (
              <tr key={assignment.id}>
                <td className="font-semibold">{assignment.admin?.fullName ?? "—"}</td>
                <td>
                  <Badge>{assignment.status}</Badge>
                </td>
                <td>{fmtDate(assignment.assignedAt)}</td>
                <td>{assignment.endedAt ? fmtDate(assignment.endedAt) : "—"}</td>
                <td className="text-xs text-muted-foreground">{assignment.notes ?? "—"}</td>
                <td>
                  {assignment.status === "ACTIVE" && (
                    <Button
                      variant="link"
                      onClick={() => void remove(assignment.id)}
                      disabled={removeAssignment.isPending}
                    >
                      Remove
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "Activity" && (
          <>
            <Table head={["When", "Actor", "Action", "Summary", "Outcome"]} empty={!audit.isPending && (audit.data?.data.length ?? 0) === 0} loading={audit.isPending}>
              {(audit.data?.data ?? []).map((entry) => (
                <tr key={entry.id}>
                  <td>{fmtDateTime(entry.timestamp)}</td>
                  <td>{entry.actor?.fullName ?? "System"}</td>
                  <td>{humanize(entry.action)}</td>
                  <td className="text-xs text-muted-foreground">{entry.summary ?? "—"}</td>
                  <td>
                    <Badge>{entry.outcome}</Badge>
                  </td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </div>

      {edit && <ClientForm open onClose={() => setEdit(false)} client={detail} />}
    </>
  );
}
