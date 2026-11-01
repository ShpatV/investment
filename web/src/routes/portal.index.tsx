import { createFileRoute } from '@tanstack/react-router';
import { ClientDashboard } from '@/components/portal/ClientPages';
import { portalHead } from '@/lib/portal-head';
export const Route = createFileRoute('/portal/')({ head: () => portalHead('Client dashboard', 'Client dashboard in the Corestone Investment frontend demo.'), component: ClientDashboard });
