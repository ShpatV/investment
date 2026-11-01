import { createFileRoute } from '@tanstack/react-router';
import { AdminAssignments } from '@/components/portal/AdminManagement';
import { portalHead } from '@/lib/portal-head';
export const Route = createFileRoute('/admin/assignments')({ head: () => portalHead('Client assignments', 'Client assignments in the Corestone Investment frontend demo.'), component: AdminAssignments });
