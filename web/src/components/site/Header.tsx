import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslatedProducts, useTranslatedMarkets } from "@/lib/site-i18n";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { setLanguage, getCurrentLanguage } from "@/lib/i18n";

const groups = ["Deposits", "Capital markets", "Commodities"] as const;
const groupLabels: Record<string, string> = { Deposits: "Deposits", "Capital markets": "Capital markets", Commodities: "Commodities" };

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect x="1" y="1" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1" />
        <rect x="8" y="8" width="12" height="12" fill="var(--gold)" />
      </svg>
      <span className="leading-none">
        <span className="block font-display text-xl tracking-wide">Avencrestcorp</span>
        <span className="mt-0.5 block text-[0.6rem] font-semibold uppercase tracking-[0.32em] opacity-70">Investment</span>
      </span>
    </span>
  );
}

export function Header() {
  const { t } = useTranslation();
  const products = useTranslatedProducts();
  const markets = useTranslatedMarkets();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<null | "products" | "markets">(null);
  const [closeTimer, setCloseTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const overHero = pathname === "/" && !scrolled;

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      setOpen(false);
      setMenu(null);
    }
  }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const k = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(false), setMenu(null));
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  const navCls = "text-[0.8rem] font-medium tracking-wide transition-colors";
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        overHero ? "bg-transparent text-navy-foreground" : "border-b border-border bg-background/90 text-foreground backdrop-blur-md",
      )}
    >
      <div className="container-x flex h-20 items-center justify-between">
        <Link to="/" aria-label="Avencrestcorp home"><Logo /></Link>

        <nav aria-label="Main" className="hidden items-center gap-9 lg:flex" onMouseLeave={() => { const t = setTimeout(() => setMenu(null), 500); setCloseTimer(t); }}>
          <div className="relative" onMouseEnter={() => { if (closeTimer) { clearTimeout(closeTimer); setCloseTimer(null); } setMenu("products"); }}>
            <button className={cn(navCls, "flex items-center gap-1 hover:text-gold cursor-pointer")} aria-expanded={menu === "products"} onClick={() => setMenu(menu === "products" ? null : "products")}>
              Products <ChevronDown className="size-3.5" />
            </button>
          </div>
          <div className="relative" onMouseEnter={() => { if (closeTimer) { clearTimeout(closeTimer); setCloseTimer(null); } setMenu("markets"); }}>
            <button className={cn(navCls, "flex items-center gap-1 hover:text-gold cursor-pointer")} aria-expanded={menu === "markets"} onClick={() => setMenu(menu === "markets" ? null : "markets")}>
              Markets <ChevronDown className="size-3.5" />
            </button>
          </div>
          <Link to="/products" className={cn(navCls, "hover:text-gold")} onMouseEnter={() => { if (closeTimer) { clearTimeout(closeTimer); setCloseTimer(null); } setMenu(null); }}>Overview</Link>
          <Link to="/kontakt" className={cn(navCls, "hover:text-gold")} onMouseEnter={() => { if (closeTimer) { clearTimeout(closeTimer); setCloseTimer(null); } setMenu(null); }}>Contact</Link>

          {menu && (
            <div onMouseEnter={() => { if (closeTimer) { clearTimeout(closeTimer); setCloseTimer(null); } }} className="absolute inset-x-0 top-20 border-y border-border bg-background text-foreground shadow-card animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="container-x grid gap-10 py-10 md:grid-cols-4">
                {menu === "products" ? (
                  <>
                    {groups.map((g) => (
                      <div key={g}>
                        <p className="eyebrow mb-4">{g}</p>
                        <ul className="space-y-2.5">
                          {products.filter((p) => p.category === g).map((p) => (
                            <li key={p.slug}>
                              <Link to="/$product" params={{ product: p.slug }} className="font-display text-xl hover:text-gold">{p.name}</Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <div className="border-l border-border pl-8">
                      <p className="text-sm text-muted-foreground">Compare every category side by side — terms, horizon and risk.</p>
                      <Link to="/products" className="mt-4 inline-block text-sm font-semibold link-underline">All products →</Link>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="md:col-span-3 grid grid-cols-2 gap-x-10 gap-y-3 md:grid-cols-3">
                      {markets.map((m) => (
                        <Link key={m.slug} to="/markets/$asset" params={{ asset: m.slug }} className="flex items-baseline justify-between border-b border-border py-2 hover:text-gold">
                          <span className="font-display text-xl">{m.name}</span>
                          <span className="text-xs text-muted-foreground">{m.symbol}</span>
                        </Link>
                      ))}
                    </div>
                    <div className="border-l border-border pl-8">
                      <p className="text-sm text-muted-foreground">Reference prices with visible sources and observation times.</p>
                      <Link to="/markets" className="mt-4 inline-block text-sm font-semibold link-underline">Market overview →</Link>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </nav>

        <div className="hidden items-center gap-6 lg:flex">
          <div className="relative">
            <button
              type="button"
              onClick={() => setLangOpen(!langOpen)}
              className={cn(navCls, "flex items-center gap-1 cursor-pointer hover:text-gold", overHero ? "text-navy-foreground" : "text-foreground")}
              aria-label="Select language"
            >
              {getCurrentLanguage().toUpperCase()}
              <svg className="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 4.5L6 7.5L9 4.5" />
              </svg>
            </button>
            {langOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 min-w-[80px] rounded-lg border border-border bg-card py-1 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
                  {["en", "sv", "de"].map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => { setLanguage(lang); setLangOpen(false); }}
                      className={cn(
                        "block w-full px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wider transition-colors",
                        getCurrentLanguage() === lang
                          ? "text-gold bg-gold/5"
                          : "text-foreground hover:bg-secondary/50 hover:text-gold",
                      )}
                    >
                      {lang === "en" ? "English" : lang === "sv" ? "Svenska" : "Deutsch"}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <Link to="/login" className={cn(navCls, "hover:text-gold")}>{t("auth.signIn")}</Link>
          <Link to="/kontakt" className={cn("border px-5 py-2.5 text-[0.75rem] font-semibold uppercase tracking-[0.16em] transition-colors", overHero ? "border-gold text-gold hover:bg-gold hover:text-navy-deep" : "border-primary bg-primary text-primary-foreground hover:bg-navy-deep")}>
            {t("nav.speakWithUs")}
          </Link>
        </div>

        <button className="lg:hidden cursor-pointer" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {open && (
        <div className="fixed inset-x-0 bottom-0 top-20 z-40 overflow-y-auto bg-navy-deep text-navy-foreground animate-in fade-in duration-300 lg:hidden">
          <nav aria-label="Mobile" className="container-x py-8">
            {groups.map((g) => (
              <div key={g} className="mb-8">
                <p className="eyebrow mb-3">{g}</p>
                {products.filter((p) => p.category === g).map((p) => (
                  <Link key={p.slug} to="/$product" params={{ product: p.slug }} className="block border-b border-navy-border py-3 font-display text-2xl">{p.name}</Link>
                ))}
              </div>
            ))}
            <div className="mb-6">
            <p className="eyebrow mb-3">Language</p>
            <div className="flex gap-2">
              <button onClick={() => setLanguage("en")} className={cn("px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border", getCurrentLanguage() === "en" ? "border-gold text-gold" : "border-border hover:border-gold")}>EN</button>
              <button onClick={() => setLanguage("sv")} className={cn("px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border", getCurrentLanguage() === "sv" ? "border-gold text-gold" : "border-border hover:border-gold")}>SV</button>
              <button onClick={() => setLanguage("de")} className={cn("px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border", getCurrentLanguage() === "de" ? "border-gold text-gold" : "border-border hover:border-gold")}>DE</button>
            </div>
          </div>
          <p className="eyebrow mb-3">Explore</p>
            {[
              { to: "/products", l: "All products" },
              { to: "/markets", l: "Markets" },
              { to: "/kontakt", l: "Contact" },
              { to: "/login", l: "Client login" },
            ].map((i) => (
              <Link key={i.to} to={i.to} className="block border-b border-navy-border py-3 font-display text-2xl">{i.l}</Link>
            ))}
            <Link to="/kontakt" className="mt-10 block bg-gold py-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-navy-deep">Speak with us</Link>
          </nav>
        </div>
      )}
    </header>
  );
}

