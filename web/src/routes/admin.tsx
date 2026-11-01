import { createFileRoute } from '@tanstack/react-router';
import { PortalShell } from '@/components/portal/Shell';
export const Route = createFileRoute('/admin')({ component: Layout });
function Layout() { return <PortalShell area="admin" />; }
