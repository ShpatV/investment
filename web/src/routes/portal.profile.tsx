import { createFileRoute } from '@tanstack/react-router';
import { ClientProfile } from '@/components/portal/ClientPages';
import { portalHead } from '@/lib/portal-head';
export const Route = createFileRoute('/portal/profile')({ head: () => portalHead('Your profile', 'Your profile in the Corestone Investment frontend demo.'), component: ClientProfile });
