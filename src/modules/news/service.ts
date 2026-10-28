import { createHash } from 'node:crypto';
import { config } from '../../config';
import { prisma } from '../../lib/prisma';

export interface NewsArticle {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  url: string;
  publishedAt: string | null;
  imageUrl: string | null;
}

export interface NewsResult {
  status: 'ok' | 'stale' | 'unavailable' | 'unconfigured';
  provider: string;
  articles: NewsArticle[];
  fetchedAt: string | null;
  cached: boolean;
  message?: string;
}

interface CachedPayload {
  articles: NewsArticle[];
  fetchedAt: string;
  provider: string;
}

function cacheKey(): string {
  const digest = createHash('sha256').update(config.newsQuery).digest('hex').slice(0, 24);
  return `news:${digest}`;
}

function mapArticles(payload: unknown): NewsArticle[] {
  if (!payload || typeof payload !== 'object') return [];
  const articles = (payload as { articles?: unknown }).articles;
  if (!Array.isArray(articles)) return [];

  const mapped: NewsArticle[] = [];
  for (const entry of articles) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (!title || !url || title === '[Removed]' || url === '[Removed]') continue;
    const source =
      item.source && typeof item.source === 'object' && typeof (item.source as { name?: unknown }).name === 'string'
        ? ((item.source as { name: string }).name)
        : 'Unknown source';
    mapped.push({
      id: createHash('sha256').update(url).digest('hex').slice(0, 24),
      title,
      summary: typeof item.description === 'string' ? item.description : null,
      source,
      url,
      publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : null,
      imageUrl: typeof item.urlToImage === 'string' ? item.urlToImage : null,
    });
  }
  return mapped.slice(0, 20);
}

export async function getMarketNews(limit = 12): Promise<NewsResult> {
  const key = cacheKey();
  const cached = await prisma.newsCache.findUnique({ where: { key } });

  if (cached && cached.expiresAt > new Date()) {
    const payload = cached.payload as unknown as CachedPayload;
    return {
      status: 'ok',
      provider: payload.provider,
      articles: payload.articles.slice(0, limit),
      fetchedAt: payload.fetchedAt,
      cached: true,
    };
  }

  if (config.newsProvider === 'none' || !config.newsApiKey) {
    return {
      status: 'unconfigured',
      provider: config.newsProvider,
      articles: [],
      fetchedAt: null,
      cached: false,
      message:
        'Market news is not configured. Set NEWS_API_KEY on the server to enable headlines. No articles are fabricated.',
    };
  }

  try {
    const url = new URL('https://newsapi.org/v2/everything');
    url.searchParams.set('q', config.newsQuery);
    url.searchParams.set('language', 'en');
    url.searchParams.set('sortBy', 'publishedAt');
    url.searchParams.set('pageSize', '20');

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        'X-Api-Key': config.newsApiKey,
        'User-Agent': 'investment-platform/1.0',
      },
    });
    if (!response.ok) throw new Error(`News provider responded ${response.status}`);
    const body = (await response.json()) as unknown;
    if ((body as { status?: string }).status !== 'ok') {
      throw new Error('News provider returned an error response');
    }

    const articles = mapArticles(body);
    const fetchedAt = new Date();
    const payload: CachedPayload = {
      articles,
      fetchedAt: fetchedAt.toISOString(),
      provider: 'NewsAPI',
    };

    await prisma.newsCache.upsert({
      where: { key },
      update: {
        payload: payload as unknown as object,
        fetchedAt,
        expiresAt: new Date(Date.now() + config.newsCacheMinutes * 60 * 1000),
      },
      create: {
        key,
        payload: payload as unknown as object,
        fetchedAt,
        expiresAt: new Date(Date.now() + config.newsCacheMinutes * 60 * 1000),
      },
    });

    return {
      status: 'ok',
      provider: 'NewsAPI',
      articles: articles.slice(0, limit),
      fetchedAt: payload.fetchedAt,
      cached: false,
    };
  } catch (error) {
    if (cached) {
      const payload = cached.payload as unknown as CachedPayload;
      return {
        status: 'stale',
        provider: payload.provider,
        articles: payload.articles.slice(0, limit),
        fetchedAt: payload.fetchedAt,
        cached: true,
        message: 'The news provider is temporarily unavailable. Showing the last successfully cached articles.',
      };
    }
    return {
      status: 'unavailable',
      provider: 'NewsAPI',
      articles: [],
      fetchedAt: null,
      cached: false,
      message:
        error instanceof Error
          ? `Market news is temporarily unavailable: ${error.message}`
          : 'Market news is temporarily unavailable',
    };
  }
}
