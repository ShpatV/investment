import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Check } from "lucide-react";
import office from "@/assets/office.jpg";
import { Calculator } from "@/components/site/Calculator";
import { Breadcrumb, PageHero, Reveal, SectionHeading, buttonCls } from "@/components/site/ui";
import { useTranslation } from "react-i18next";
import { getProduct } from "@/lib/site";
import { useTranslatedProducts } from "@/lib/site-i18n";

export const Route = createFileRoute("/$product")({
  loader: ({ params }) => {
    const p = getProduct(params.product);
    if (!p) throw notFound();
    return { product: p };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.product;
    if (!p) return { meta: [{ title: "Unavailable — Avencrestcorp" }, { name: "robots", content: "noindex" }] };
    return {
      meta: [
        { title: `${p.name} — Avencrestcorp` },
        { name: "description", content: p.summary },
        { property: "og:title", content: `${p.name} — Avencrestcorp` },
        { property: "og:description", content: p.summary },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const products = useTranslatedProducts();
  const { t } = useTranslation();
  const loaded = Route.useLoaderData();
  const { product } = Route.useParams();
  // Static catalog data can recover a route match retained without loader data after a preview update.
  const p = products.find((x) => x.slug === product) ?? loaded?.product ?? getProduct(product);
  if (!p) throw notFound();
  const others = products.filter((x) => x.slug !== p.slug && x.category === p.category).concat(products.filter((x) => x.category !== p.category)).slice(0, 3);
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.name} intro={p.summary}>
        <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Products", to: "/products" }, { label: p.name }]} />
        <div className="flex flex-wrap gap-3">
          <Link to="/kontakt" className={buttonCls("gold")}>{t("productPage.askAbout")} {p.name.toLowerCase()} <ArrowRight className="size-4" /></Link>
          {p.rate && <a href="#calculator" className={buttonCls("outlineLight")}>{t("productPage.calculateScenario")}</a>}
        </div>
      </PageHero>

      <section className="border-b border-border">
        <dl className="container-x grid grid-cols-2 md:grid-cols-4">
          {(p.rate ? [{ label: "Indicative rate", value: `${p.rate.toFixed(2)}% p.a.` }, ...p.facts.slice(0, 3)] : p.facts).map((f, i) => (
            <div key={f.label} className={`py-10 ${i > 0 ? "md:border-l md:border-border md:pl-10" : ""}`}>
              <dt className="eyebrow">{f.label}</dt>
              <dd className="mt-3 font-display text-3xl">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="py-24 md:py-32">
        <div className="container-x grid gap-16 md:grid-cols-12">
          <div className="md:col-span-7">
            <SectionHeading eyebrow={t("productPage.startWithDocuments")} title={t("productPage.whatYouShouldKnow")} intro={p.detail} />
            <Reveal delay={120} className="mt-12">
              <p className="eyebrow mb-6">{t("productPage.usefulChecks")}</p>
              <ul className="space-y-4">
                {p.considerations.map((c) => (
                  <li key={c} className="flex gap-4 border-b border-border pb-4 text-lg"><Check className="mt-1 size-5 shrink-0 text-gold" />{c}</li>
                ))}
              </ul>
            </Reveal>
          </div>
          <Reveal delay={200} className="md:col-span-5">
            <aside className="border-l-2 border-gold bg-secondary p-10">
              <AlertTriangle className="size-6 text-gold" strokeWidth={1.5} />
              <h3 className="mt-6 text-3xl">{t("productPage.keepRiskInView")}</h3>
              <p className="mt-4 leading-relaxed text-muted-foreground">{p.risk}</p>
              <p className="mt-6 text-sm leading-relaxed text-muted-foreground">Tax treatment depends on your personal circumstances and may change. Figures shown are information, not a promise of future returns.</p>
            </aside>
            <img src={office} alt="" loading="lazy" width={1600} height={1088} className="mt-8 aspect-[4/3] w-full object-cover" />
          </Reveal>
        </div>
      </section>

      {p.rate && (
        <section id="calculator" className="scroll-mt-20 bg-navy-gradient py-24 text-navy-foreground md:py-32">
          <div className="container-x">
            <SectionHeading light eyebrow={t("productPage.calculatorTitle")} title={`${t("productPage.calculatorTitle")} ${p.name.toLowerCase()}.`} />
            <Reveal className="mt-12"><Calculator dark defaultSlug={p.slug} /></Reveal>
          </div>
        </section>
      )}

      <section className="py-24">
        <div className="container-x">
          <p className="eyebrow">{t("productPage.continueExploring")}</p>
          <div className="mt-8 grid gap-px border border-border bg-white md:grid-cols-3">
            {others.map((o) => (
              <Link key={o.slug} to="/$product" params={{ product: o.slug }} className="group bg-card p-8 transition-colors hover:bg-secondary">
                <span className="text-xs text-muted-foreground">{o.category}</span>
                <h3 className="mt-4 text-3xl group-hover:text-gold">{o.name}</h3>
                <p className="mt-3 text-sm text-muted-foreground">{o.eyebrow}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

