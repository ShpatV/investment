import { createFileRoute } from '@tanstack/react-router';
import { ClientTransactions } from '@/components/portal/ClientPages';
import { portalHead } from '@/lib/portal-head';
export const Route = createFileRoute('/portal/transactions')({ head: () => portalHead('Your transactions', 'Your transactions in the Corestone Investment frontend demo.'), component: ClientTransactions });
