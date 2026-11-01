import { createFileRoute } from '@tanstack/react-router';
import { AdminAccounts } from '@/components/portal/AdminManagement';
import { portalHead } from '@/lib/portal-head';
export const Route = createFileRoute('/admin/admins')({ head: () => portalHead('Administrator accounts', 'Administrator accounts in the Corestone Investment frontend demo.'), component: AdminAccounts });
