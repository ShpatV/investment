import { useTranslation } from "react-i18next";
import { products as baseProducts, markets as baseMarkets } from "./site";
import type { Product, Market } from "./site";

export function useTranslatedProducts(): Product[] {
  const { t } = useTranslation();
  return baseProducts.map((p) => {
    const translated = t(`data.products.${p.slug}`, { returnObjects: true }) as {
      name?: string;
      category?: string;
      eyebrow?: string;
      summary?: string;
      detail?: string;
      risk?: string;
      facts?: { label: string; value: string }[];
      considerations?: string[];
    } | string;
    if (typeof translated === "string") return p;
    return {
      ...p,
      name: translated?.name ?? p.name,
      category: p.category, // Keep English for filtering
      eyebrow: translated?.eyebrow ?? p.eyebrow,
      summary: translated?.summary ?? p.summary,
      detail: translated?.detail ?? p.detail,
      risk: translated?.risk ?? p.risk,
      facts: translated?.facts ?? p.facts,
      considerations: translated?.considerations ?? p.considerations,
    };
  });
}

export function useTranslatedMarkets(): Market[] {
  const { t } = useTranslation();
  return baseMarkets.map((m) => {
    const translated = t(`data.markets.${m.slug}`, { returnObjects: true }) as {
      name?: string;
      unit?: string;
      source?: string;
      description?: string;
    } | string;
    if (typeof translated === "string") return m;
    return {
      ...m,
      name: translated?.name ?? m.name,
      unit: translated?.unit ?? m.unit,
      source: translated?.source ?? m.source,
      description: translated?.description ?? m.description,
    };
  });
}

export function useTranslatedFaqs(): { q: string; a: string }[] {
  const { t } = useTranslation();
  const faqs = t("faqs", { returnObjects: true }) as { q: string; a: string }[] | string;
  if (typeof faqs === "string" || !Array.isArray(faqs)) return [];
  return faqs;
}