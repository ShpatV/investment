import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { F, input, Modal } from "./kit";
import { useAdmins, useCreateClient, useUpdateClient } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/api/client";
import type { User } from "@/lib/api/types";

type EditableClient = Pick<
  User,
  "id" | "firstName" | "lastName" | "email" | "phone" | "address" | "dateOfBirth"
>;

export function ClientForm({
  open,
  onClose,
  client,
}: {
  open: boolean;
  onClose: () => void;
  client?: EditableClient;
}) {
  const { user } = useAuth();
  const superAdmin = user?.role === "SUPER_ADMIN";
  const admins = useAdmins({ pageSize: 100, status: "ACTIVE", role: "ADMIN" });
  const create = useCreateClient();
  const update = useUpdateClient();
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const submitting = create.isPending || update.isPending;

  const adminOptions = (admins.data?.data ?? []).filter((admin) => admin.role !== "USER");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") ?? "").trim();
    const address = String(form.get("address") ?? "").trim();
    const dateOfBirth = String(form.get("dateOfBirth") ?? "");
    const assignedAdminId = String(form.get("assignedAdminId") ?? "");
    const notes = String(form.get("notes") ?? "").trim();

    try {
      if (client) {
        await update.mutateAsync({
          id: client.id,
          input: {
            firstName: String(form.get("firstName") ?? "").trim(),
            lastName: String(form.get("lastName") ?? "").trim(),
            email: String(form.get("email") ?? "").trim(),
            ...(phone ? { phone } : {}),
            address: address || null,
            ...(dateOfBirth ? { dateOfBirth } : {}),
          },
        });
        toast.success("Client updated.");
        onClose();
        return;
      }

      const result = await create.mutateAsync({
        firstName: String(form.get("firstName") ?? "").trim(),
        lastName: String(form.get("lastName") ?? "").trim(),
        email: String(form.get("email") ?? "").trim(),
        ...(phone ? { phone } : {}),
        ...(address ? { address } : {}),
        ...(dateOfBirth ? { dateOfBirth } : {}),
        ...(assignedAdminId ? { assignedAdminId } : {}),
        ...(notes ? { notes } : {}),
      });

      if (result.invitation?.token) {
        setInvitationToken(result.invitation.token);
        toast.success("Client created. Share the invitation link below.");
      } else {
        toast.success("Client created and invited.");
        onClose();
      }
    } catch (error) {
      toast.error(errorMessage(error, "The client could not be saved."));
    }
  };

  return (
    <Modal open={open} title={client ? "Edit client" : "Add client"} onClose={onClose}>
      {invitationToken ? (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            The account exists but no email service is configured, so deliver this one-time invitation link yourself.
            It expires in seven days.
          </p>
          <code className="block break-all border border-border bg-secondary/50 p-3 text-xs">
            /accept-invitation?token={invitationToken}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/accept-invitation" search={{ token: invitationToken }}>
                Open link
              </Link>
            </Button>
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(
                  `${window.location.origin}/accept-invitation?token=${encodeURIComponent(invitationToken)}`,
                );
                toast.success("Invitation link copied.");
              }}
            >
              Copy link
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <F label="First name">
            {(id) => <input id={id} className={input} name="firstName" defaultValue={client?.firstName ?? ""} required />}
          </F>
          <F label="Last name">
            {(id) => <input id={id} className={input} name="lastName" defaultValue={client?.lastName ?? ""} required />}
          </F>
          <F label="Email">
            {(id) => (
              <input id={id} className={input} name="email" type="email" defaultValue={client?.email ?? ""} required />
            )}
          </F>
          <F label="Phone">
            {(id) => <input id={id} className={input} name="phone" defaultValue={client?.phone ?? ""} />}
          </F>
          <F label="Address" className="sm:col-span-2">
            {(id) => <input id={id} className={input} name="address" defaultValue={client?.address ?? ""} />}
          </F>
          <F label="Date of birth">
            {(id) => (
              <input id={id} className={input} name="dateOfBirth" type="date" defaultValue={client?.dateOfBirth ?? ""} />
            )}
          </F>
          {!client && superAdmin && (
            <F label="Assigned administrator">
              {(id) => (
                <select id={id} name="assignedAdminId" className={input} defaultValue="">
                  <option value="">Assign later</option>
                  {adminOptions.map((admin) => (
                    <option key={admin.id} value={admin.id}>
                      {admin.fullName}
                    </option>
                  ))}
                </select>
              )}
            </F>
          )}
          {!client && (
            <F label="Notes" className="sm:col-span-2">
              {(id) => <textarea id={id} name="notes" className={input} rows={2} />}
            </F>
          )}
          {client && (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">
                Account status and administrator assignment are managed from the client list and assignments pages.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={submitting}>{submitting ? "Saving…" : client ? "Save client" : "Create & invite"}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
