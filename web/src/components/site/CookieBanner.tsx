import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { buttonCls } from "./ui";

const KEY = "cs-cookie-consent";

export function useCookieConsent() {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!localStorage.getItem(KEY)) setOpen(true); }, []);
  return { open, setOpen };
}

export function CookieBanner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [analytics, setAnalytics] = useState(false);
  if (!open) return null;
  const save = (a: boolean) => { localStorage.setItem(KEY, JSON.stringify({ necessary: true, analytics: a })); onClose(); };
  return (
    <div role="dialog" aria-label="Cookie preferences" className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-xl border border-navy-border bg-navy-deep p-7 text-navy-foreground shadow-card animate-in slide-in-from-bottom-4 fade-in duration-500 md:left-auto md:right-6">
      <p className="eyebrow">Your browser, your preferences</p>
      <p className="mt-3 text-sm leading-relaxed text-navy-muted">
        We use what is strictly necessary to run this site. Optional analytics only with your consent. <Link to="/legal/$doc" params={{ doc: "cookies" }} className="text-navy-foreground underline underline-offset-4">Read the notice</Link>.
      </p>
      <label className="mt-5 flex items-center gap-3 text-sm">
        <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} className="size-4 accent-gold" />
        Allow anonymous analytics
      </label>
      <div className="mt-6 flex flex-wrap gap-3">
        <button className={buttonCls("gold")} onClick={() => save(true)}>Accept all</button>
        <button className={buttonCls("outlineLight")} onClick={() => save(analytics)}>Save selection</button>
      </div>
    </div>
  );
}
