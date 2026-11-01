import { createFileRoute } from '@tanstack/react-router';
import { AdminClients } from '@/components/portal/AdminClients';
import { portalHead } from '@/lib/portal-head';
export const Route = createFileRoute('/admin/clients/')({ head: () => portalHead('Client management', 'Client management in the Corestone Investment frontend demo.'), component: AdminClients });
