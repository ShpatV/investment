import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export const input = "w-full border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-gold";
export const pbtn = {
  primary: "inline-flex items-center justify-center gap-2 bg-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground transition-colors hover:bg-navy-deep disabled:opacity-50",
  gold: "inline-flex items-center justify-center gap-2 bg-gold px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-navy-deep transition-colors hover:bg-gold-soft",
  ghost: "inline-flex items-center justify-center gap-2 border border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors hover:border-foreground",
  link: "text-xs font-semibold uppercase tracking-[0.14em] text-foreground hover:text-gold",
};

export function PageHeader({ eyebrow, title, actions, children }: { eyebrow?: string; title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 text-4xl md:text-5xl">{title}</h1>
        {children && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="border border-border bg-card p-6 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-3 font-display text-3xl tabular-nums md:text-4xl">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0", className)}>
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-2xl">{title}</h2>
        {action}
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}

const positive = "bg-positive/10 text-positive";
const attention = "bg-gold/15 text-foreground";
const negative = "bg-negative/10 text-negative";
const neutral = "bg-secondary text-muted-foreground";

const tones: Record<string, string> = {
  // Title-case labels
  Active: positive,
  Completed: positive,
  Available: positive,
  Pending: attention,
  "Under review": attention,
  Failed: negative,
  Disabled: negative,
  Matured: neutral,
  Closed: neutral,
  Archived: neutral,
  Ended: neutral,
  Stale: attention,
  "Manual override": attention,
  Unavailable: negative,
  // Raw API enums
  ACTIVE: positive,
  COMPLETED: positive,
  LIVE: positive,
  PENDING: attention,
  STALE: attention,
  FAILED: negative,
  DISABLED: negative,
  UNAVAILABLE: negative,
  MATURED: neutral,
  CLOSED: neutral,
  ARCHIVED: neutral,
  REMOVED: neutral,
  REPLACED: neutral,
  SUPER_ADMIN: "bg-primary text-primary-foreground",
  ADMIN: "bg-accent text-accent-foreground",
  USER: neutral,
};

export function Badge({ children }: { children: string }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider",
        tones[children] ?? "bg-secondary",
      )}
    >
      {children.replace(/_/g, " ")}
    </span>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto border border-border bg-card">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border bg-secondary/60 text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">
          <tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="[&_td]:px-4 [&_td]:py-3.5 [&_tr]:border-b [&_tr]:border-border [&_tr:last-child]:border-0">{children}</tbody>
      </table>
      {empty && <p className="p-10 text-center text-sm text-muted-foreground">Nothing matches these filters.</p>}
    </div>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-xs">
      <Button variant="outline" disabled={page === 1} onClick={() => onPage(page - 1)}>Prev</Button>
      <span className="px-2 tabular-nums text-muted-foreground">Page {page} / {pages}</span>
      <Button variant="outline" disabled={page === pages} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  );
}
export const paginate = <T,>(list: T[], page: number, size = 8) => ({ rows: list.slice((page - 1) * size, page * size), pages: Math.max(1, Math.ceil(list.length / size)) });

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex flex-wrap border-b border-border">
      {options.map((o) => (
        <Button variant="ghost" key={o} role="tab" aria-selected={value === o} onClick={() => onChange(o)}
          className={cn("-mb-px border-b-2 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] transition-colors", value === o ? "border-gold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {o}
        </Button>
      ))}
    </div>
  );
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}><DialogContent aria-describedby={undefined} className="max-h-[85svh] max-w-xl overflow-y-auto"><DialogTitle className="font-display text-3xl">{title}</DialogTitle>{children}</DialogContent></Dialog>
  );
}

export function F({ label, error, children, className }: { label: string; error?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</label>
      {children(id)}
      {error && <p className="mt-1 text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}

const palette = ["var(--navy)", "var(--gold)", "var(--navy-muted)", "var(--gold-soft)", "var(--positive)"];
export function Donut({ data, format }: { data: { name: string; amount: number; pct: number }[]; format: (v: number) => string }) {
  let acc = 0;
  const R = 42, C = 2 * Math.PI * R;
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <svg viewBox="0 0 100 100" className="size-40 shrink-0 -rotate-90" role="img" aria-label="Allocation by institution">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--secondary)" strokeWidth="12" />
        {data.map((d, i) => {
          const el = <circle key={d.name} cx="50" cy="50" r={R} fill="none" stroke={palette[i % palette.length]} strokeWidth="12" strokeDasharray={`${d.pct * C} ${C}`} strokeDashoffset={-acc * C}><title>{`${d.name}: ${format(d.amount)} (${(d.pct * 100).toFixed(1)}%)`}</title></circle>;
          acc += d.pct;
          return el;
        })}
      </svg>
      <ul className="w-full space-y-2 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><span className="size-2.5" style={{ background: palette[i % palette.length] }} />{d.name}</span>
            <span className="tabular-nums text-muted-foreground">{format(d.amount)} · {(d.pct * 100).toFixed(1)}%</span>
          </li>
        ))}
        {!data.length && <li className="text-muted-foreground">No active investments.</li>}
      </ul>
    </div>
  );
}
