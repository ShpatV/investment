import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import stone from "@/assets/stone.jpg";
import { PageHero, Reveal, Sparkline } from "@/components/site/ui";
import { useTranslation } from "react-i18next";
import { num, priceSeries } from "@/lib/site";
import { useTranslatedMarkets } from "@/lib/site-i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/markets/")({
  head: () => ({
    meta: [
      { title: "Markets — Avencrestcorp" },
      { name: "description", content: "Indicative reference prices for gold, silver, platinum, palladium, Bitcoin and Ethereum, with sources." },
      { property: "og:title", content: "Markets — Avencrestcorp" },
      { property: "og:description", content: "Reference prices with visible sources and observation times." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Markets,
});

function Markets() {
  const { t } = useTranslation();
  const markets = useTranslatedMarkets();
  const observed = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  return (
    <>
      <PageHero image={stone} eyebrow="Market view" title="A look at reference prices." intro="Indicative references shown with their source and observation time. They are not trading quotes." />
      <section className="py-20 md:py-28">
        <div className="container-x">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-2"><span className="size-2 animate-pulse rounded-full bg-positive" /> Observed {observed}</span>
            <span>Refreshed every 30 minutes</span>
          </div>
          <div className="mt-6 border-t border-border">
            {markets.map((m, i) => (
              <Reveal key={m.slug} delay={i * 60}>
                <Link to="/markets/$asset" params={{ asset: m.slug }} className="group grid grid-cols-2 items-center gap-6 border-b border-border py-8 transition-colors hover:bg-secondary md:grid-cols-[1.5fr_1fr_1.5fr_1fr_auto] md:px-4">
                  <div><p className="font-display text-3xl group-hover:text-gold">{m.name}</p><p className="text-xs tracking-[0.2em] text-muted-foreground">{m.symbol} · {m.unit}</p></div>
                  <p className="text-right font-display text-3xl tabular-nums md:text-left">{num(m.price)}</p>
                  <Sparkline data={priceSeries(m)} positive={m.change >= 0} className="hidden h-12 w-full md:block" />
                  <p className={cn("tabular-nums", m.change >= 0 ? "text-positive" : "text-negative")}>{m.change >= 0 ? "+" : ""}{m.change.toFixed(2)}% <span className="text-xs text-muted-foreground">24h</span></p>
                  <ArrowRight className="hidden size-5 transition-transform group-hover:translate-x-1 md:block" />
                </Link>
              </Reveal>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">Illustrative reference data for demonstration. Prices may differ from those available for execution. Crypto-assets are highly volatile and not covered by deposit protection.</p>
        </div>
      </section>
    </>
  );
}

