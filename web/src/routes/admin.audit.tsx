import { createFileRoute } from '@tanstack/react-router';
import { AdminAudit } from '@/components/portal/AdminPricesAudit';
import { portalHead } from '@/lib/portal-head';
export const Route = createFileRoute('/admin/audit')({ head: () => portalHead('Administrative audit log', 'Administrative audit log in the Avencrestcorp frontend demo.'), component: AdminAudit });

