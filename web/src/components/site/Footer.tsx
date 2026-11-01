import { Link } from "@tanstack/react-router";
import { products, markets } from "@/lib/site";
import { Logo } from "./Header";

export function Footer({ onCookies }: { onCookies: () => void }) {
  return (
    <footer className="bg-navy-deep text-navy-foreground">
      <div className="container-x grid gap-12 py-20 md:grid-cols-12">
        <div className="md:col-span-4">
          <Logo />
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-navy-muted">
            A considered approach to your next financial step. Understand first, decide with perspective.
          </p>
        </div>
        <FooterCol title="Products" items={products.map((p) => ({ label: p.name, to: "/$product", params: { product: p.slug } }))} />
        <FooterCol title="Markets" items={markets.map((m) => ({ label: m.name, to: "/markets/$asset", params: { asset: m.slug } }))} />
        <FooterCol
          title="Company"
          items={[
            { label: "Contact", to: "/kontakt" },
            { label: "Client login", to: "/login" },
            { label: "Legal notice", to: "/legal/$doc", params: { doc: "imprint" } },
            { label: "Privacy policy", to: "/legal/$doc", params: { doc: "privacy" } },
            { label: "Terms of use", to: "/legal/$doc", params: { doc: "terms" } },
            { label: "Cookie notice", to: "/legal/$doc", params: { doc: "cookies" } },
          ]}
        />
      </div>
      <div className="border-t border-navy-border">
        <div className="container-x flex flex-col gap-4 py-8 text-xs text-navy-muted md:flex-row md:items-center md:justify-between">
          <p className="max-w-3xl leading-relaxed">
            Figures and calculations are for information only and are not a promise of future returns. Investments carry risk, including the loss of capital. Review current product documents before making a commitment.
          </p>
          <div className="flex shrink-0 gap-6">
            <button onClick={onCookies} className="link-underline hover:text-navy-foreground">Cookie settings</button>
            <span>Â© {new Date().getFullYear()} Avencrestcorp</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: { label: string; to: string; params?: Record<string, string> }[] }) {
  return (
    <div className="md:col-span-2 lg:col-span-2 md:[&:last-child]:col-span-4 lg:[&:last-child]:col-span-4">
      <p className="eyebrow mb-5">{title}</p>
      <ul className="space-y-2.5 text-sm">
        {items.map((i) => (
          <li key={i.label}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Link to={i.to as any} params={i.params as any} className="text-navy-muted transition-colors hover:text-gold">{i.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

