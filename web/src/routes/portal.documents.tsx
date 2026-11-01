import { createFileRoute } from '@tanstack/react-router';
import { ClientDocuments } from '@/components/portal/ClientPages';
import { portalHead } from '@/lib/portal-head';
export const Route = createFileRoute('/portal/documents')({ head: () => portalHead('Your documents', 'Your documents in the Avencrestcorp frontend demo.'), component: ClientDocuments });

