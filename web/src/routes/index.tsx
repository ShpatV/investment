import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText, LineChart, ShieldCheck, Plus } from "lucide-react";
import { useState } from "react";
import hero from "@/assets/hero.jpg";
import office from "@/assets/office.jpg";
import stone from "@/assets/stone.jpg";
import { Calculator } from "@/components/site/Calculator";
import { Reveal, SectionHeading, Sparkline, buttonCls } from "@/components/site/ui";
import { faqs, markets, num, priceSeries, products } from "@/lib/site";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Avencrestcorp â€” Understand first. Decide with perspective." },
      { name: "description", content: "Savings, fixed deposits, bonds, equities and commodities â€” explained clearly, with terms, risks and reference prices in view." },
      { property: "og:title", content: "Avencrestcorp" },
      { property: "og:description", content: "A considered approach to your next financial step." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const highlights = [
  { icon: FileText, t: "Terms stated up front", d: "Every product page sets out conditions and risks before any next step is asked of you." },
  { icon: LineChart, t: "Market view", d: "Reference prices published with their source and observation time â€” never without context." },
  { icon: ShieldCheck, t: "Risk and tax notes in writing", d: "Risk warnings and tax notes sit on the page itself, not in a document you must request." },
];

function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[100svh] items-end overflow-hidden bg-navy-deep text-navy-foreground">
        <img src={hero} alt="Avencrestcorp offices at dusk" className="absolute inset-0 h-full w-full object-cover animate-slowzoom" width={1920} height={1088} />
        <div className="absolute inset-0 bg-veil" />
        <div className="absolute inset-0 bg-fade" />
        <div className="container-x relative pb-20 pt-40 md:pb-28">
          <p className="eyebrow flex items-center gap-4 animate-rise"><span className="gold-rule" />A little clarity goes a long way</p>
          <h1 className="mt-8 max-w-5xl text-[3.25rem] leading-[0.98] animate-rise sm:text-7xl lg:text-[6.5rem]" style={{ animationDelay: "120ms" }}>
            Letâ€™s start with <em className="text-gold-soft">what matters</em> to you.
          </h1>
          <div className="mt-10 grid gap-10 md:grid-cols-12 md:items-end">
            <p className="max-w-xl text-lg leading-relaxed text-navy-muted animate-rise md:col-span-6" style={{ animationDelay: "240ms" }}>
              Whether you are setting money aside or weighing an investment, there is room to take your time. Look around, try the planning tools, and bring the questions that come up.
            </p>
            <div className="flex flex-wrap gap-3 animate-rise md:col-span-6 md:justify-end" style={{ animationDelay: "360ms" }}>
              <a href="#products" className={buttonCls("gold")}>Take a look around <ArrowRight className="size-4" /></a>
              <a href="#calculator" className={buttonCls("outlineLight")}>Work out a scenario</a>
            </div>
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div className="overflow-hidden border-y border-navy-border bg-navy py-4 text-navy-foreground" aria-label="Reference prices">
        <div className="flex w-max animate-marquee gap-14 whitespace-nowrap">
          {[...markets, ...markets].map((m, i) => (
            <Link key={i} to="/markets/$asset" params={{ asset: m.slug }} className="flex items-baseline gap-3 text-sm hover:text-gold">
              <span className="text-xs font-semibold tracking-[0.2em] text-navy-muted">{m.symbol}</span>
              <span className="tabular-nums">{num(m.price)}</span>
              <span className={cn("text-xs tabular-nums", m.change >= 0 ? "text-positive" : "text-negative")}>{m.change >= 0 ? "+" : ""}{m.change.toFixed(2)}%</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Highlights */}
      <section className="py-24 md:py-32">
        <div className="container-x grid gap-px bg-border md:grid-cols-3">
          {highlights.map((h, i) => (
            <Reveal key={h.t} delay={i * 120} className="bg-background p-10 md:p-12">
              <h.icon className="size-6 text-gold" strokeWidth={1.25} />
              <h3 className="mt-8 text-3xl">{h.t}</h3>
              <p className="mt-4 leading-relaxed text-muted-foreground">{h.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Products */}
      <section id="products" className="scroll-mt-20 pb-24 md:pb-32">
        <div className="container-x">
          <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <SectionHeading eyebrow="Explore the possibilities" title="There is more than one way to begin." intro="Browse the categories and see which fit the questions you have about your money." />
            <Link to="/products" className="shrink-0 text-sm font-semibold link-underline">Compare all products â†’</Link>
          </div>
          <div className="mt-16 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p, i) => (
              <Reveal key={p.slug} delay={(i % 4) * 80}>
                <Link to="/$product" params={{ product: p.slug }} className="group relative flex h-full min-h-80 flex-col bg-card p-8 transition-colors duration-500 hover:bg-navy hover:text-navy-foreground">
                  <span className="text-xs tabular-nums text-muted-foreground group-hover:text-navy-muted">0{i + 1} Â· {p.category}</span>
                  <h3 className="mt-10 text-4xl">{p.name}</h3>
                  <p className="mt-2 text-sm text-gold">{p.eyebrow}</p>
                  <p className="mt-5 text-sm leading-relaxed text-muted-foreground group-hover:text-navy-muted">{p.summary}</p>
                  <span className="mt-auto flex items-center justify-between pt-8 text-xs font-semibold uppercase tracking-[0.18em]">
                    {p.rate ? <span>from <span className="font-display text-2xl normal-case tracking-normal">{p.rate.toFixed(2)}%</span> p.a.</span> : <span>Learn more</span>}
                    <ArrowRight className="size-4 transition-transform duration-500 group-hover:translate-x-1 group-hover:text-gold" />
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Philosophy split */}
      <section className="bg-navy-gradient text-navy-foreground">
        <div className="grid md:grid-cols-2">
          <div className="relative min-h-[28rem] overflow-hidden">
            <img src={office} alt="A quiet meeting room prepared for a client conversation" loading="lazy" width={1600} height={1088} className="absolute inset-0 h-full w-full object-cover" />
          </div>
          <div className="flex items-center px-6 py-24 md:px-16 lg:px-24">
            <div>
              <SectionHeading light eyebrow="Our approach" title="Purpose first. Details next. Decisions in your own time." />
              <Reveal delay={150}>
                <ul className="mt-12 space-y-8">
                  {[
                    ["01", "Understand", "We begin with your goal and horizon, not with a product."],
                    ["02", "Compare", "Terms, risks and costs are set out side by side, in plain language."],
                    ["03", "Decide", "When you are ready â€” and only then â€” we prepare the documents."],
                  ].map(([n, t, d]) => (
                    <li key={n} className="grid grid-cols-[3rem_1fr] gap-4 border-t border-navy-border pt-6">
                      <span className="font-display text-xl text-gold">{n}</span>
                      <div><p className="font-display text-2xl">{t}</p><p className="mt-1 text-sm text-navy-muted">{d}</p></div>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* Calculator */}
      <section id="calculator" className="scroll-mt-20 py-24 md:py-32">
        <div className="container-x">
          <SectionHeading eyebrow="Calculator" title="Try a few numbers." intro="Change the inputs to compare scenarios. Keep in mind the difference between an estimate and a confirmed product offer." />
          <Reveal className="mt-14"><Calculator /></Reveal>
        </div>
      </section>

      {/* Markets */}
      <section className="relative overflow-hidden bg-navy-deep py-24 text-navy-foreground md:py-32">
        <img src={stone} alt="" loading="lazy" width={1600} height={1088} className="absolute inset-0 h-full w-full object-cover opacity-25" />
        <div className="container-x relative">
          <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <SectionHeading light eyebrow="Market view" title="A look at reference prices." intro="Indicative references with source and observation time. Not executable quotes." />
            <Link to="/markets" className="shrink-0 text-sm font-semibold text-gold link-underline">Full market overview â†’</Link>
          </div>
          <div className="mt-14 grid gap-px bg-navy-border sm:grid-cols-2 lg:grid-cols-3">
            {markets.map((m, i) => (
              <Reveal key={m.slug} delay={i * 70}>
                <Link to="/markets/$asset" params={{ asset: m.slug }} className="group block bg-navy-deep/90 p-8 backdrop-blur transition-colors hover:bg-navy">
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-2xl">{m.name}</span>
                    <span className="text-xs tracking-[0.2em] text-navy-muted">{m.symbol}</span>
                  </div>
                  <Sparkline data={priceSeries(m)} positive={m.change >= 0} className="mt-6 h-16 w-full" />
                  <div className="mt-6 flex items-baseline justify-between">
                    <span className="font-display text-3xl tabular-nums">{num(m.price)}</span>
                    <span className={cn("text-sm tabular-nums", m.change >= 0 ? "text-positive" : "text-negative")}>{m.change >= 0 ? "+" : ""}{m.change.toFixed(2)}%</span>
                  </div>
                  <p className="mt-1 text-xs text-navy-muted">{m.unit} Â· {m.source}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-border py-20">
        <div className="container-x grid gap-10 text-center sm:grid-cols-3">
          {[["8", "Product categories"], ["6", "Reference markets"], ["30 min", "Data refresh interval"]].map(([v, l], i) => (
            <Reveal key={l} delay={i * 100}>
              <p className="font-display text-6xl md:text-7xl">{v}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{l}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 md:py-32">
        <div className="container-x grid gap-16 md:grid-cols-12">
          <div className="md:col-span-5"><SectionHeading eyebrow="Questions" title="The questions you might already have." /></div>
          <div className="md:col-span-7"><Faq /></div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-navy text-navy-foreground">
        <div className="container-x flex flex-col items-start justify-between gap-10 py-20 md:flex-row md:items-center">
          <Reveal>
            <p className="eyebrow">Start a conversation</p>
            <h2 className="mt-4 max-w-2xl text-4xl md:text-5xl">Tell us what is on your mind.</h2>
          </Reveal>
          <Link to="/kontakt" className={buttonCls("gold")}>Contact us <ArrowRight className="size-4" /></Link>
        </div>
      </section>
    </>
  );
}

export function Faq({ items = faqs }: { items?: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="border-t border-border">
      {items.map((f, i) => (
        <div key={f.q} className="border-b border-border">
          <h3>
            <button aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-6 py-7 text-left font-display text-2xl transition-colors hover:text-gold">
              {f.q}
              <Plus className={cn("size-5 shrink-0 text-gold transition-transform duration-500", open === i && "rotate-45")} />
            </button>
          </h3>
          <div className={cn("grid transition-all duration-500", open === i ? "grid-rows-[1fr] pb-7 opacity-100" : "grid-rows-[0fr] opacity-0")}>
            <p className="overflow-hidden leading-relaxed text-muted-foreground">{f.a}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

