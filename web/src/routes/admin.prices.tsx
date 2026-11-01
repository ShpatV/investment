import { createFileRoute } from '@tanstack/react-router';
import { AdminPrices } from '@/components/portal/AdminPricesAudit';
import { portalHead } from '@/lib/portal-head';
export const Route = createFileRoute('/admin/prices')({ head: () => portalHead('Published commodity prices', 'Published commodity prices in the Corestone Investment frontend demo.'), component: AdminPrices });
