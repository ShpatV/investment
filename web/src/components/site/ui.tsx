import { Link } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Reveal({ children, className, delay = 0, as: Tag = "div" }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) { el.classList.add("is-visible"); io.disconnect(); }
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={cn("reveal", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

export function SectionHeading({ eyebrow, title, intro, light, className }: { eyebrow: string; title: ReactNode; intro?: ReactNode; light?: boolean; className?: string }) {
  return (
    <Reveal className={cn("max-w-3xl", className)}>
      <p className="eyebrow flex items-center gap-4"><span className="gold-rule" />{eyebrow}</p>
      <h2 className={cn("mt-6 text-4xl leading-[1.05] md:text-6xl", light ? "text-navy-foreground" : "text-foreground")}>{title}</h2>
      {intro && <p className={cn("mt-6 max-w-2xl text-base leading-relaxed md:text-lg", light ? "text-navy-muted" : "text-muted-foreground")}>{intro}</p>}
    </Reveal>
  );
}

const btn = {
  gold: "bg-gold text-navy-deep hover:bg-gold-soft",
  navy: "bg-primary text-primary-foreground hover:bg-navy-deep",
  outline: "border border-current hover:bg-foreground hover:text-background",
  outlineLight: "border border-navy-foreground/40 text-navy-foreground hover:border-gold hover:text-gold",
};
export const buttonCls = (v: keyof typeof btn = "navy") =>
  cn("inline-flex items-center justify-center gap-3 px-7 py-4 text-[0.72rem] font-semibold uppercase tracking-[0.18em] transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed", btn[v]);

export function PageHero({ eyebrow, title, intro, image, children }: { eyebrow: string; title: ReactNode; intro?: ReactNode; image?: string; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-navy-gradient pb-20 pt-40 text-navy-foreground md:pb-28 md:pt-48">
      {image && (
        <>
          <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 animate-slowzoom" width={1600} height={1088} />
          <div className="absolute inset-0 bg-veil" />
        </>
      )}
      <div className="container-x relative">
        <p className="eyebrow flex items-center gap-4 animate-rise"><span className="gold-rule" />{eyebrow}</p>
        <h1 className="mt-8 max-w-4xl text-5xl leading-[1.02] animate-rise md:text-7xl" style={{ animationDelay: "120ms" }}>{title}</h1>
        {intro && <p className="mt-8 max-w-2xl text-lg leading-relaxed text-navy-muted animate-rise" style={{ animationDelay: "240ms" }}>{intro}</p>}
        {children && <div className="mt-10 animate-rise" style={{ animationDelay: "360ms" }}>{children}</div>}
      </div>
    </section>
  );
}

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-8 text-xs uppercase tracking-[0.18em] text-navy-muted animate-rise">
      {items.map((i, idx) => (
        <span key={i.label}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {i.to ? <Link to={i.to as any} className="hover:text-gold">{i.label}</Link> : <span className="text-navy-foreground">{i.label}</span>}
          {idx < items.length - 1 && <span className="mx-3 text-gold">/</span>}
        </span>
      ))}
    </nav>
  );
}

export function Sparkline({ data, className, positive = true }: { data: number[]; className?: string; positive?: boolean }) {
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / (max - min || 1)) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={positive ? "var(--gold)" : "var(--negative)"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
