import { createFileRoute } from '@tanstack/react-router';
import { PortalShell } from '@/components/portal/Shell';
export const Route = createFileRoute('/portal')({ component: Layout });
function Layout() { return <PortalShell area="client" />; }
