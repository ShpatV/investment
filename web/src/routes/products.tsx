import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import stone from "@/assets/stone.jpg";
import { Calculator } from "@/components/site/Calculator";
import { PageHero, Reveal, SectionHeading } from "@/components/site/ui";
import { useTranslatedProducts } from "@/lib/site-i18n";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "Products — Avencrestcorp" },
      { name: "description", content: "Compare savings, fixed and flex deposits, bonds, stocks, IPOs, gold and crude oil side by side." },
      { property: "og:title", content: "Products — Avencrestcorp" },
      { property: "og:description", content: "Every category, its terms and its risks, in one overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Products,
});

const filters = ["All", "Deposits", "Capital markets", "Commodities"] as const;

function Products() {
  const { t } = useTranslation();
  const products = useTranslatedProducts();
  const [f, setF] = useState<(typeof filters)[number]>("All");
  const list = products.filter((p) => f === "All" || p.category === f);
  return (
    <>
      <PageHero image={stone} eyebrow={t("nav.products")} title={t("products.pageTitle")} intro={t("products.pageIntro")} />
      <section className="py-20 md:py-28">
        <div className="container-x">
          <div role="tablist" aria-label="Filter by category" className="flex flex-wrap gap-2">
            {filters.map((x) => (
              <button key={x} role="tab" aria-selected={f === x} onClick={() => setF(x)}
                className={cn("border px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] transition-colors cursor-pointer", f === x ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-foreground")}>
                {x}
              </button>
            ))}
          </div>
          <div className="mt-12 overflow-x-auto border border-border bg-card shadow-card">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-navy-border bg-navy text-xs uppercase tracking-[0.16em] text-navy-foreground/90">
                <tr><th className="p-5 font-semibold text-navy-foreground/90">Product</th><th className="p-5 font-semibold text-navy-foreground/90">Category</th><th className="p-5 font-semibold">Key traits</th><th className="p-5 font-semibold">Indicative rate</th><th className="p-5" /></tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.slug} className="group border-b border-border last:border-0 transition-colors hover:bg-secondary">
                    <td className="p-5"><span className="font-display text-2xl">{p.name}</span><p className="text-xs text-muted-foreground">{p.eyebrow}</p></td>
                    <td className="p-5 text-muted-foreground">{p.category}</td>
                    <td className="p-5">{p.facts[0]?.value} · {p.facts[1]?.value}</td>
                    <td className="p-5 font-display text-2xl tabular-nums">{p.rate ? `${p.rate.toFixed(2)}%` : "—"}</td>
                    <td className="p-5 text-right">
                      <Link to="/$product" params={{ product: p.slug }} className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] hover:text-gold">Details <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Indicative rates for illustration. Binding conditions are set out in each product's documents.</p>
        </div>
      </section>
      <section className="bg-secondary py-20 md:py-28">
        <div className="container-x">
          <SectionHeading eyebrow={t("index.calculatorEyebrow")} title={t("products.calculatorTitle")} />
          <Reveal className="mt-12"><Calculator /></Reveal>
        </div>
      </section>
    </>
  );
}

