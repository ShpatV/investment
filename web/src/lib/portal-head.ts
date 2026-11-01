export const portalHead = (name: string, description: string) => ({ meta: [
  { title: `${name} — Corestone Investment` }, { name: 'description', content: description },
  { property: 'og:title', content: `${name} — Corestone Investment` }, { property: 'og:description', content: description },
  { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }, { name: 'robots', content: 'noindex' },
] });
