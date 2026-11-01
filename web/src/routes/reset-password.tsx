import { createFileRoute } from "@tanstack/react-router";
import { SetPasswordForm } from "@/components/portal/SetPassword";
import { portalHead } from "@/lib/portal-head";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  head: () => portalHead("Reset your password", "Choose a new password for your Avencrestcorp account."),
  component: ResetPassword,
});

function ResetPassword() {
  const { token } = Route.useSearch();
  return <SetPasswordForm token={token} kind="reset" />;
}

