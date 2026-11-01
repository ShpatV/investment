import { useId, useMemo, useState } from "react";
import { eur, products, projectSavings } from "@/lib/site";
import { cn } from "@/lib/utils";

const rated = products.filter((p) => p.rate);

export function Calculator({ dark = false, defaultSlug = "festgeld" }: { dark?: boolean; defaultSlug?: string }) {
  const [slug, setSlug] = useState(rated.some((p) => p.slug === defaultSlug) ? defaultSlug : "festgeld");
  const [amount, setAmount] = useState(25000);
  const [monthly, setMonthly] = useState(250);
  const [years, setYears] = useState(5);
  const [rate, setRate] = useState(rated.find((p) => p.slug === slug)!.rate!);

  const res = useMemo(() => projectSavings(amount, monthly, rate, years), [amount, monthly, rate, years]);
  const max = Math.max(...res.yearly);

  const choose = (s: string) => { setSlug(s); setRate(rated.find((p) => p.slug === s)!.rate!); };

  return (
    <div className={cn("grid gap-0 border md:grid-cols-5", dark ? "border-navy-border bg-navy text-navy-foreground" : "border-border bg-card shadow-card")}>
      <div className={cn("space-y-7 p-8 md:col-span-3 md:p-10", dark ? "border-navy-border" : "border-border", "md:border-r")}>
        <div>
          <p className="eyebrow mb-3">Product</p>
          <div role="radiogroup" aria-label="Product" className="flex flex-wrap gap-2">
            {rated.map((p) => (
              <button key={p.slug} role="radio" aria-checked={slug === p.slug} onClick={() => choose(p.slug)}
                className={cn("border px-4 py-2 text-xs font-semibold tracking-wide transition-colors",
                  slug === p.slug ? "border-gold bg-gold text-navy-deep" : dark ? "border-navy-border hover:border-gold" : "border-border hover:border-foreground")}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <Slider dark={dark} label="Initial amount" value={amount} min={1000} max={250000} step={1000} onChange={setAmount} fmt={(v) => eur(v)} />
        <Slider dark={dark} label="Monthly contribution" value={monthly} min={0} max={5000} step={50} onChange={setMonthly} fmt={(v) => eur(v)} />
        <Slider dark={dark} label="Horizon" value={years} min={1} max={20} step={1} onChange={setYears} fmt={(v) => `${v} ${v === 1 ? "year" : "years"}`} />
        <Slider dark={dark} label="Assumed annual rate" value={rate} min={0} max={8} step={0.05} onChange={setRate} fmt={(v) => `${v.toFixed(2)} %`} />
      </div>
      <div className="flex flex-col p-8 md:col-span-2 md:p-10">
        <p className="eyebrow">Estimated value</p>
        <p className="mt-3 font-display text-5xl tabular-nums md:text-6xl" aria-live="polite">{eur(res.value)}</p>
        <dl className={cn("mt-6 grid grid-cols-2 gap-4 border-t pt-6 text-sm", dark ? "border-navy-border" : "border-border")}>
          <div><dt className={dark ? "text-navy-muted" : "text-muted-foreground"}>Paid in</dt><dd className="mt-1 font-semibold tabular-nums">{eur(res.contributed)}</dd></div>
          <div><dt className={dark ? "text-navy-muted" : "text-muted-foreground"}>Interest</dt><dd className="mt-1 font-semibold tabular-nums text-gold">+{eur(res.interest)}</dd></div>
        </dl>
        <div className="mt-8 flex h-32 items-end gap-1" aria-hidden="true">
          {res.yearly.map((v, i) => (
            <div key={i} className="flex-1 bg-gold/80 transition-all duration-500" style={{ height: `${(v / max) * 100}%`, opacity: 0.35 + (i / res.yearly.length) * 0.65 }} />
          ))}
        </div>
        <p className={cn("mt-auto pt-8 text-xs leading-relaxed", dark ? "text-navy-muted" : "text-muted-foreground")}>
          An estimate for orientation, not a confirmed offer. Excludes taxes, fees and future rate changes.
        </p>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt, dark }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string; dark: boolean }) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className={cn("text-sm", dark ? "text-navy-muted" : "text-muted-foreground")}>{label}</label>
        <span className="font-display text-2xl tabular-nums">{fmt(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-3 w-full accent-gold" />
    </div>
  );
}
