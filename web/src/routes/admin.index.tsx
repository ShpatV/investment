import { createFileRoute } from '@tanstack/react-router';
import { AdminOverview } from '@/components/portal/AdminOverview';
import { portalHead } from '@/lib/portal-head';
export const Route = createFileRoute('/admin/')({ head: () => portalHead('Administration overview', 'Administration overview in the Avencrestcorp frontend demo.'), component: AdminOverview });

