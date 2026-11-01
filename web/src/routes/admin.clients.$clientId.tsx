import { createFileRoute } from '@tanstack/react-router';
import { AdminClientDetail } from '@/components/portal/AdminClients';
import { portalHead } from '@/lib/portal-head';
export const Route = createFileRoute('/admin/clients/$clientId')({ head: () => portalHead('Client account detail', 'Manage client investments, transactions, documents and personal information in the Avencrestcorp demo.'), component: ClientDetail });
function ClientDetail() { const { clientId } = Route.useParams(); return <AdminClientDetail clientId={clientId} />; }

