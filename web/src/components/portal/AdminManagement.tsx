import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, F, input, Modal, PageHeader, Pager, Table } from "./kit";
import { useAuth } from "@/lib/auth";
import {
  useAdmins,
  useAssignments,
  useCreateAdmin,
  useCreateAssignment,
  useRemoveAssignment,
  useToggleAdmin,
  useUnassignedClients,
  useUpdateAdmin,
  useUpdateAssignment,
} from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { clientName, fmtDate, humanize } from "@/lib/format";
import type { AdminListItem, AdminAssignment, AssignmentStatus, UserStatus } from "@/lib/api/types";

const PAGE_SIZE = 10;
const ROLES: Array<"ADMIN" | "SUPER_ADMIN"> = ["ADMIN", "SUPER_ADMIN"];

const errorText = (error: unknown) => errorMessage(error, "The request could not be completed.");

export function AdminAccounts() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminListItem | null>(null);
  const [toggleTarget, setToggleTarget] = useState<AdminListItem | null>(null);
  const [invite, setInvite] = useState<{ name: string; token: string } | null>(null);

  const admins = useAdmins({
    page,
    pageSize: PAGE_SIZE,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(status ? { status } : {}),
  });
  const toggle = useToggleAdmin();

  const rows = admins.data?.data ?? [];
  const totalPages = admins.data?.pagination.totalPages ?? 1;
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
      toast.success(toggleTarget.status === "ACTIVE" ? "Administrator disabled." : "Administrator reactivated.");
      setToggleTarget(null);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Access control"
        title="Administrator accounts"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Add administrator
          </Button>
        }
      >
        Only super administrators can create, edit or disable administrator accounts.
      </PageHeader>

      <div className="mb-5 flex flex-wrap gap-3">
        <input
          aria-label="Search administrators"
          className={`${input} max-w-xs`}
          placeholder="Search name or email"
          value={search}
          onChange={(event) => reset(() => setSearch(event.target.value))}
        />
        <select
          aria-label="Administrator status"
          className={`${input} w-auto`}
          value={status}
          onChange={(event) => reset(() => setStatus(event.target.value as UserStatus | ""))}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
        </select>
      </div>

      {admins.error && <p className="mb-4 text-sm text-destructive">{errorText(admins.error)}</p>}

      <Table
        head={["Administrator", "Role", "Status", "Assigned clients", "Last sign-in", "Actions"]}
        empty={!admins.isPending && rows.length === 0}
      >
        {rows.map((admin) => (
          <tr key={admin.id}>
            <td>
              <p className="font-semibold">{admin.fullName}</p>
              <p className="text-xs text-muted-foreground">{admin.email}</p>
            </td>
            <td>
              <Badge>{admin.role}</Badge>
            </td>
            <td>
              <Badge>{admin.status}</Badge>
            </td>
            <td>{admin.assignedClientCount}</td>
            <td>{admin.lastLoginAt ? fmtDate(admin.lastLoginAt) : "—"}</td>
            <td>
              <div className="flex flex-wrap items-center">
                <Button variant="link" onClick={() => setEditing(admin)}>
                  Edit
                </Button>
                {admin.id !== user?.id && (
                  <Button variant="link" onClick={() => setToggleTarget(admin)}>
                    {admin.status === "ACTIVE" ? "Disable" : "Reactivate"}
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {admins.isPending && <p className="mt-4 text-sm text-muted-foreground">Loading administrators…</p>}
      <Pager page={page} pages={totalPages} onPage={setPage} />

      {createOpen && <AdminForm onClose={() => setCreateOpen(false)} onInvite={setInvite} />}
      {editing && <AdminForm admin={editing} onClose={() => setEditing(null)} onInvite={setInvite} />}

      <Modal open={Boolean(toggleTarget)} title="Confirm account change" onClose={() => setToggleTarget(null)}>
        <p className="text-sm text-muted-foreground">
          {toggleTarget?.status === "ACTIVE"
            ? `Disabling ${toggleTarget.fullName} signs them out and blocks future sign-ins. Client assignments are retained.`
            : `Reactivating ${toggleTarget?.fullName ?? "this administrator"} restores access.`}
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

function AdminForm({
  admin,
  onClose,
  onInvite,
}: {
  admin?: AdminListItem;
  onClose: () => void;
  onInvite: (invite: { name: string; token: string }) => void;
}) {
  const create = useCreateAdmin();
  const update = useUpdateAdmin();
  const submitting = create.isPending || update.isPending;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") ?? "").trim();
    const firstName = String(form.get("firstName") ?? "").trim();
    const lastName = String(form.get("lastName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const role = String(form.get("role")) as "ADMIN" | "SUPER_ADMIN";
    try {
      if (admin) {
        await update.mutateAsync({
          id: admin.id,
          input: { firstName, lastName, email, role, ...(phone ? { phone } : {}) },
        });
        toast.success("Administrator updated.");
        onClose();
        return;
      }
      const result = await create.mutateAsync({
        firstName,
        lastName,
        email,
        role,
        ...(phone ? { phone } : {}),
      });
      if (result.invitation?.token) {
        onInvite({ name: `${firstName} ${lastName}`.trim(), token: result.invitation.token });
      } else {
        toast.success("Administrator created and invited.");
      }
      onClose();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <Modal open title={admin ? "Edit administrator" : "Add administrator"} onClose={onClose}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <F label="First name">
          {(id) => <input id={id} name="firstName" className={input} defaultValue={admin?.firstName ?? ""} required />}
        </F>
        <F label="Last name">
          {(id) => <input id={id} name="lastName" className={input} defaultValue={admin?.lastName ?? ""} required />}
        </F>
        <F label="Email">
          {(id) => <input id={id} name="email" type="email" className={input} defaultValue={admin?.email ?? ""} required />}
        </F>
        <F label="Phone">
          {(id) => <input id={id} name="phone" className={input} defaultValue={admin?.phone ?? ""} />}
        </F>
        <F label="Role">
          {(id) => (
            <select id={id} name="role" className={input} defaultValue={admin?.role ?? "ADMIN"}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {humanize(role)}
                </option>
              ))}
            </select>
          )}
        </F>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={submitting}>
            {submitting ? "Saving…" : admin ? "Save administrator" : "Create & invite"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const ASSIGNMENT_STATUSES: AssignmentStatus[] = ["ACTIVE", "REPLACED", "REMOVED"];

export function AdminAssignments() {
  const { user } = useAuth();
  const superAdmin = user?.role === "SUPER_ADMIN";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AssignmentStatus | "">("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AdminAssignment | null>(null);

  const assignments = useAssignments({
    page,
    pageSize: PAGE_SIZE,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(status ? { status } : {}),
  });
  const admins = useAdmins({ pageSize: 100, status: "ACTIVE", role: "ADMIN" });
  const update = useUpdateAssignment();
  const remove = useRemoveAssignment();

  const rows = assignments.data?.data ?? [];
  const totalPages = assignments.data?.pagination.totalPages ?? 1;
  const adminOptions = (admins.data?.data ?? []).filter((admin) => admin.role !== "USER");

  const confirmRemove = async () => {
    if (!removeTarget) return;
    try {
      await remove.mutateAsync(removeTarget.id);
      toast.success("Assignment removed.");
      setRemoveTarget(null);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const reassign = async (assignment: AdminAssignment, adminId: string) => {
    try {
      await update.mutateAsync({ id: assignment.id, input: { adminId } });
      toast.success("Client reassigned.");
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <>
      <PageHeader eyebrow="Relationships" title="Client assignments">
        {superAdmin
          ? "Super administrators can reassign clients at any time. History is retained."
          : "Assignments are managed by super administrators. Depending on firm settings you may be able to claim unassigned clients."}
      </PageHeader>

      <div className="mb-5 flex flex-wrap gap-3">
        <input
          aria-label="Search assignments"
          className={`${input} max-w-xs`}
          placeholder="Search client or administrator"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Assignment status"
          className={`${input} w-auto`}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as AssignmentStatus | "");
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {ASSIGNMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </select>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          New assignment
        </Button>
      </div>

      {assignments.error && <p className="mb-4 text-sm text-destructive">{errorText(assignments.error)}</p>}

      <Table
        head={["Client", "Administrator", "Status", "Assigned", "Ended", "Notes", "Actions"]}
        empty={!assignments.isPending && rows.length === 0}
      >
        {rows.map((assignment) => (
          <tr key={assignment.id}>
            <td>
              <p className="font-semibold">{assignment.client?.fullName ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{assignment.client?.email ?? assignment.clientId}</p>
            </td>
            <td>
              {superAdmin && assignment.status === "ACTIVE" ? (
                <select
                  aria-label="Reassign administrator"
                  className={input}
                  value={assignment.adminId}
                  onChange={(event) => void reassign(assignment, event.target.value)}
                  disabled={update.isPending}
                >
                  {adminOptions.map((admin) => (
                    <option key={admin.id} value={admin.id}>
                      {admin.fullName}
                    </option>
                  ))}
                </select>
              ) : (
                assignment.admin?.fullName ?? "—"
              )}
            </td>
            <td>
              <Badge>{assignment.status}</Badge>
            </td>
            <td>{fmtDate(assignment.assignedAt)}</td>
            <td>{assignment.endedAt ? fmtDate(assignment.endedAt) : "—"}</td>
            <td className="text-xs text-muted-foreground">{assignment.notes ?? "—"}</td>
            <td>
              {assignment.status === "ACTIVE" && (
                <Button variant="link" onClick={() => setRemoveTarget(assignment)}>
                  Remove
                </Button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {assignments.isPending && <p className="mt-4 text-sm text-muted-foreground">Loading assignments…</p>}
      <Pager page={page} pages={totalPages} onPage={setPage} />

      {createOpen && <AssignForm onClose={() => setCreateOpen(false)} adminOptions={adminOptions} />}

      <Modal open={Boolean(removeTarget)} title="Remove assignment" onClose={() => setRemoveTarget(null)}>
        <p className="text-sm text-muted-foreground">
          Removing this assignment ends {removeTarget ? clientName({ firstName: removeTarget.client?.fullName ?? "", lastName: "" }) : "the client"}&apos;s
          advisor relationship. The history is kept and the client becomes unassigned.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRemoveTarget(null)}>
            Cancel
          </Button>
          <Button onClick={() => void confirmRemove()} disabled={remove.isPending}>
            {remove.isPending ? "Removing…" : "Remove assignment"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

function AssignForm({
  onClose,
  adminOptions,
}: {
  onClose: () => void;
  adminOptions: Array<{ id: string; fullName: string }>;
}) {
  const { user } = useAuth();
  const superAdmin = user?.role === "SUPER_ADMIN";
  const [search, setSearch] = useState("");
  const unassigned = useUnassignedClients(search);
  const create = useCreateAssignment();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const clientId = String(form.get("clientId") ?? "");
    const adminId = superAdmin ? String(form.get("adminId") ?? "") : user?.id ?? "";
    const notes = String(form.get("notes") ?? "").trim();
    if (!clientId || !adminId) {
      toast.error("Select a client and an administrator.");
      return;
    }
    try {
      await create.mutateAsync({ clientId, adminId, ...(notes ? { notes } : {}) });
      toast.success("Client assigned.");
      onClose();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const clients = unassigned.data?.data ?? [];

  return (
    <Modal open title="New assignment" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <F label="Find an unassigned client">
          {(id) => (
            <input
              id={id}
              className={input}
              placeholder="Search name or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
        </F>
        {unassigned.error && <p className="text-xs text-destructive">{errorText(unassigned.error)}</p>}
        <F label="Client">
          {(id) => (
            <select id={id} name="clientId" className={input} required defaultValue="">
              <option value="" disabled>
                Select an unassigned client
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.firstName} {client.lastName} · {client.email}
                </option>
              ))}
            </select>
          )}
        </F>
        {superAdmin ? (
          <F label="Administrator">
            {(id) => (
              <select id={id} name="adminId" className={input} required defaultValue="">
                <option value="" disabled>
                  Select an administrator
                </option>
                {adminOptions.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.fullName}
                  </option>
                ))}
              </select>
            )}
          </F>
        ) : (
          <p className="text-xs text-muted-foreground">The client will be assigned to you ({user?.fullName}).</p>
        )}
        <F label="Notes">
          {(id) => <textarea id={id} name="notes" className={input} rows={2} />}
        </F>
        {!unassigned.isPending && clients.length === 0 && (
          <p className="text-xs text-muted-foreground">Every active client already has an advisor.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={create.isPending}>{create.isPending ? "Saving…" : "Create assignment"}</Button>
        </div>
      </form>
    </Modal>
  );
}
