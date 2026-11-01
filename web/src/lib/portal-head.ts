export const portalHead = (name: string, description: string) => ({ meta: [
  { title: `${name} — Avencrestcorp` }, { name: 'description', content: description },
  { property: 'og:title', content: `${name} — Avencrestcorp` }, { property: 'og:description', content: description },
  { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }, { name: 'robots', content: 'noindex' },
] });

