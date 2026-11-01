import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Breadcrumb, PageHero, Reveal, buttonCls } from "@/components/site/ui";
import { getMarket, markets, num, priceSeries } from "@/lib/site";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/markets/$asset")({
  loader: ({ params }) => {
    const m = getMarket(params.asset);
    if (!m) throw notFound();
    return { market: m };
  },
  head: ({ loaderData }) => {
    const m = loaderData?.market;
    if (!m) return { meta: [{ title: "Unavailable — Avencrestcorp" }, { name: "robots", content: "noindex" }] };
    return {
      meta: [
        { title: `${m.name} (${m.symbol}) reference price — Avencrestcorp` },
        { name: "description", content: m.description },
        { property: "og:title", content: `${m.name} reference price — Avencrestcorp` },
        { property: "og:description", content: m.description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: Asset,
});

const ranges = { "1M": 30, "3M": 60, "6M": 120, "1Y": 240 } as const;

function Asset() {
  const loaded = Route.useLoaderData();
  const { asset } = Route.useParams();
  const m = loaded?.market ?? getMarket(asset);
  const [range, setRange] = useState<keyof typeof ranges>("3M");
  const data = useMemo(() => m ? priceSeries(m, ranges[range]) : [], [m, range]);
  const [hover, setHover] = useState<number | null>(null);
  if (!m) throw notFound();
  const min = Math.min(...data), max = Math.max(...data);
  const y = (v: number) => 100 - ((v - min) / (max - min || 1)) * 90 - 5;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${y(v)}`).join(" ");
  const shown = (hover !== null ? data[hover] : m.price) ?? m.price;

  return (
    <>
      <PageHero eyebrow={`${m.symbol} · ${m.unit}`} title={m.name} intro={m.description}>
        <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Markets", to: "/markets" }, { label: m.name }]} />
      </PageHero>
      <section className="py-20 md:py-28">
        <div className="container-x">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="eyebrow">{hover !== null ? "Point in range" : "Reference price"}</p>
              <p className="mt-3 font-display text-6xl tabular-nums md:text-7xl">{num(shown)}</p>
              <p className={cn("mt-2 tabular-nums", m.change >= 0 ? "text-positive" : "text-negative")}>{m.change >= 0 ? "+" : ""}{m.change.toFixed(2)}% · 24h · {m.source}</p>
            </div>
            <div role="tablist" aria-label="Range" className="flex border border-border">
              {(Object.keys(ranges) as (keyof typeof ranges)[]).map((r) => (
                <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)} className={cn("px-5 py-2.5 text-xs font-semibold tracking-[0.16em] cursor-pointer", range === r ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}>{r}</button>
              ))}
            </div>
          </div>
          <Reveal className="mt-10 border border-border bg-card p-4 shadow-card md:p-8">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-72 w-full md:h-96" role="img" aria-label={`${m.name} price chart`}
              onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.round(((e.clientX - r.left) / r.width) * (data.length - 1))); }}>
              <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--gold)" stopOpacity="0.25" /><stop offset="100%" stopColor="var(--gold)" stopOpacity="0" /></linearGradient></defs>
              {[20, 40, 60, 80].map((g) => <line key={g} x1="0" x2="100" y1={g} y2={g} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
              <polygon points={`0,100 ${pts} 100,100`} fill="url(#g)" />
              <polyline points={pts} fill="none" stroke="var(--gold)" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
              {hover !== null && <line x1={(hover / (data.length - 1)) * 100} x2={(hover / (data.length - 1)) * 100} y1="0" y2="100" stroke="var(--foreground)" strokeOpacity="0.3" vectorEffect="non-scaling-stroke" />}
            </svg>
          </Reveal>
          <p className="mt-4 text-xs text-muted-foreground">Illustrative data. Reference prices are not executable quotes.</p>

          <div className="mt-20 grid gap-10 md:grid-cols-2">
            <div className="border-l-2 border-gold pl-8">
              <h2 className="text-3xl">Are reference prices trading quotes?</h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">No. They indicate where the market stood at the observation time. Actual buy and sell prices include spreads and can differ.</p>
              <Link to="/kontakt" className={`${buttonCls("navy")} mt-8`}>Ask a specific question</Link>
            </div>
            <div>
              <p className="eyebrow mb-4">Other markets</p>
              {markets.filter((x) => x.slug !== m.slug).map((x) => (
                <Link key={x.slug} to="/markets/$asset" params={{ asset: x.slug }} className="flex items-baseline justify-between border-b border-border py-4 hover:text-gold">
                  <span className="font-display text-2xl">{x.name}</span>
                  <span className="tabular-nums">{num(x.price)}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

