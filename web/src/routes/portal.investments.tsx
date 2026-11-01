import { createFileRoute } from '@tanstack/react-router';
import { ClientInvestments } from '@/components/portal/ClientPages';
import { portalHead } from '@/lib/portal-head';
export const Route = createFileRoute('/portal/investments')({ head: () => portalHead('Your investments', 'Your investments in the Avencrestcorp frontend demo.'), component: ClientInvestments });

