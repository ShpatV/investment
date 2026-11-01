import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ product: 'festgeld', asset: 'gold', doc: 'privacy' }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: () => ReactNode }) => ({
    options,
    useLoaderData: () => undefined,
    useParams: () => state,
  }),
  notFound: () => new Error('Not found'),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock('@/components/site/ui', () => ({
  PageHero: () => null,
  Breadcrumb: () => null,
  SectionHeading: () => null,
  Reveal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  buttonCls: () => '',
}));
vi.mock('@/components/site/Calculator', () => ({ Calculator: () => null }));
import { Route as Product } from '@/routes/$product';
import { Route as Market } from '@/routes/markets.$asset';
import { Route as Legal } from '@/routes/legal.$doc';
import { legalDocs } from '@/lib/site';

describe('Catalog route recovery with missing loader data', () => {
  it('renders a valid product from its URL instead of destructuring undefined', () => {
    const Component = Product.options.component;
    if (!Component) throw new Error('Missing component');
    expect(() => renderToString(<Component />)).not.toThrow();
  });
  it('renders a valid market from its URL', () => {
    const Component = Market.options.component;
    if (!Component) throw new Error('Missing component');
    expect(() => renderToString(<Component />)).not.toThrow();
  });
  it('renders a valid legal document from its URL', () => {
    state.doc = Object.keys(legalDocs)[0] ?? '';
    const Component = Legal.options.component;
    if (!Component) throw new Error('Missing component');
    expect(() => renderToString(<Component />)).not.toThrow();
  });
  it('rejects unknown products rather than rendering an unrelated product', () => {
    state.product = 'unknown-product';
    const Component = Product.options.component;
    if (!Component) throw new Error('Missing component');
    expect(() => renderToString(<Component />)).toThrow('Not found');
    state.product = 'festgeld';
  });
});