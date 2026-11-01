import * as React from "react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";

export const input = "w-full border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-gold";
export const pbtn = {
  primary: "inline-flex items-center justify-center gap-2 bg-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground transition-colors hover:bg-navy-deep disabled:opacity-50",
  gold: "inline-flex items-center justify-center gap-2 bg-gold px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-navy-deep transition-colors hover:bg-gold-soft",
  ghost: "inline-flex items-center justify-center gap-2 border border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors hover:border-foreground",
  link: "text-xs font-semibold uppercase tracking-[0.14em] text-foreground hover:text-gold",
};

export function PageHeader({ eyebrow, title, actions, children }: { eyebrow?: string; title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between animate-in fade-in slide-in-from-top-1 duration-300">
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
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm transition-all duration-200 hover:shadow-md animate-in fade-in slide-in-from-bottom-1">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-3 font-display text-3xl tabular-nums md:text-4xl">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-border bg-card shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300", className)}>
      <header className="flex items-center justify-between border-b border-navy-border bg-navy px-6 py-4 text-navy-foreground">
        <h2 className="text-2xl text-navy-foreground">{title}</h2>
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
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider transition-all duration-200",
        tones[children] ?? "bg-secondary",
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-60" />
      {children.replace(/_/g, " ")}
    </span>
  );
}

export function Table({ head, children, empty, loading }: { head: ReactNode[]; children: ReactNode; empty?: boolean; loading?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-navy-border bg-navy text-[0.68rem] uppercase tracking-[0.14em] text-navy-foreground/90">
          <tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-3.5 font-semibold text-navy-foreground/90">{h}</th>)}</tr>
        </thead>
        <tbody className="[&_td]:px-4 [&_td]:py-3.5 [&_tr]:border-b [&_tr]:border-border/40 [&_tr:last-child]:border-0 [&_tr]:transition-all [&_tr]:duration-200 [&_tr]:animate-in [&_tr]:fade-in [&_tr]:slide-in-from-bottom-1 [&_tr:hover]:bg-secondary/20">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                {head.map((_, j) => (
                  <td key={j}>
                    <div
                      className="h-4 rounded bg-secondary/50"
                      style={{ width: j === 0 ? "60%" : j === head.length - 1 ? "40%" : "70%" }}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : children}
        </tbody>
      </table>
      {empty && !loading && <p className="p-10 text-center text-sm text-muted-foreground">Nothing matches these filters.</p>}
    </div>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-2 text-xs animate-in fade-in duration-300">
      <span className="tabular-nums text-muted-foreground">Page {page} of {pages}</span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPage(page - 1)}>Prev</Button>
        <Button variant="outline" size="sm" disabled={page === pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
export const paginate = <T,>(list: T[], page: number, size = 8) => ({ rows: list.slice((page - 1) * size, page * size), pages: Math.max(1, Math.ceil(list.length / size)) });

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex flex-wrap border-b border-border">
      {options.map((o) => (
        <Button variant="ghost" key={o} type="button" role="tab" aria-selected={value === o} onClick={() => onChange(o)}
          className={cn("-mb-px border-b-2 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] transition-colors", value === o ? "border-gold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {o}
        </Button>
      ))}
    </div>
  );
}

export function FilterBar({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-2 sm:gap-3 mb-6 p-4 rounded-lg border border-border/50 bg-secondary/20 animate-in fade-in slide-in-from-top-1 duration-200",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5 min-w-0 flex-1 sm:flex-none sm:min-w-[120px]", className)}>
      <label className="text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground mb-0.5">{label}</label>
      <div className="flex items-end gap-2">{children}</div>
    </div>
  );
}

export function FilterInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      className={cn("rounded-md border border-input bg-card px-2.5 py-1.5 text-xs outline-none transition-all focus:border-gold focus:ring-1 focus:ring-gold/20 cursor-text w-full sm:w-auto sm:min-w-[140px] sm:max-w-[180px]", className)}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  placeholder = "All",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <select
      className={cn("rounded-md border border-input bg-card px-2.5 py-1.5 text-xs outline-none transition-all focus:border-gold focus:ring-1 focus:ring-gold/20 cursor-pointer w-full sm:w-auto sm:min-w-[120px] sm:max-w-[160px]", className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function DateRange({
  from,
  to,
  onFromChange,
  onToChange,
  className,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5 min-w-0 flex-1 sm:flex-none sm:min-w-[240px]", className)}>
      <div className="flex items-center gap-1.5">
        <span className="text-[0.65rem] text-muted-foreground shrink-0">From</span>
        <DatePicker value={from} onChange={onFromChange} placeholder="Start" />
        <span className="text-[0.65rem] text-muted-foreground shrink-0">To</span>
        <DatePicker value={to} onChange={onToChange} placeholder="End" />
      </div>
    </div>
  );
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? new Date(value + "T00:00:00") : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("rounded-md border border-input bg-card px-2.5 py-1.5 text-xs outline-none transition-all focus:border-gold focus:ring-1 focus:ring-gold/20 cursor-pointer w-full sm:w-auto text-left", className)}
        >
          {selected ? format(selected, "MMM d, yyyy") : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, "0");
              const d = String(date.getDate()).padStart(2, "0");
              onChange(y + "-" + m + "-" + d);
            }
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
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
