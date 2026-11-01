import { createFileRoute } from "@tanstack/react-router";
import { SetPasswordForm } from "@/components/portal/SetPassword";
import { portalHead } from "@/lib/portal-head";

export const Route = createFileRoute("/accept-invitation")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  head: () => portalHead("Activate your account", "Set a password to activate your Avencrestcorp account."),
  component: AcceptInvitation,
});

function AcceptInvitation() {
  const { token } = Route.useSearch();
  return <SetPasswordForm token={token} kind="invitation" />;
}

