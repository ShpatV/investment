import { createFileRoute } from "@tanstack/react-router";
import { Clock, Mail, MapPin } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import office from "@/assets/office.jpg";
import { PageHero, Reveal, buttonCls } from "@/components/site/ui";
import { Faq } from "./index";
import { faqs, products } from "@/lib/site";

export const Route = createFileRoute("/kontakt")({
  head: () => ({
    meta: [
      { title: "Contact â€” Avencrestcorp" },
      { name: "description", content: "Tell us what is on your mind. Send a first message about your goals, horizon or a specific product." },
      { property: "og:title", content: "Contact â€” Avencrestcorp" },
      { property: "og:description", content: "A conversation you can return to." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Contact,
});

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  email: z.string().trim().email("Please enter a valid email").max(255),
  phone: z.string().trim().max(40).optional(),
  topic: z.string().min(1, "Please choose a topic"),
  message: z.string().trim().min(10, "A few more words would help").max(2000),
  consent: z.literal(true, { errorMap: () => ({ message: "Please accept the privacy policy" }) }),
});

const field = "w-full border-0 border-b border-input bg-transparent px-0 py-3 text-base outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-gold focus:ring-0";

function Contact() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = schema.safeParse({ ...Object.fromEntries(fd), consent: fd.get("consent") === "on" });
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    await new Promise((res) => setTimeout(res, 900));
    setBusy(false);
    setSent(true);
    toast.success("Thank you â€” your message has been received.");
  };

  return (
    <>
      <PageHero image={office} eyebrow="Contact" title="Tell us what is on your mind." intro="There is no need to have everything worked out. A goal, a rough amount and a time horizon are enough to begin." />
      <section className="py-20 md:py-28">
        <div className="container-x grid gap-16 md:grid-cols-12">
          <aside className="space-y-10 md:col-span-4">
            {[
              { i: Mail, t: "Email", d: "contact@Avencrestcorppartners.de" },
              { i: Clock, t: "Response time", d: "Within two business days" },
              { i: MapPin, t: "Office", d: "Frankfurt am Main, Germany" },
            ].map((x) => (
              <Reveal key={x.t} className="flex gap-5">
                <x.i className="mt-1 size-5 text-gold" strokeWidth={1.5} />
                <div><p className="eyebrow">{x.t}</p><p className="mt-2 font-display text-2xl">{x.d}</p></div>
              </Reveal>
            ))}
            <Reveal className="border-l-2 border-gold bg-secondary p-8">
              <h2 className="text-2xl">A conversation you can return to</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">With a client login, your messages and documents stay together in one familiar place.</p>
            </Reveal>
          </aside>

          <Reveal className="md:col-span-8">
            {sent ? (
              <div className="border border-border bg-card p-12 shadow-card" role="status">
                <p className="eyebrow">Message received</p>
                <h2 className="mt-4 text-4xl">Thank you. Weâ€™ll be in touch.</h2>
                <p className="mt-4 text-muted-foreground">A member of our team will reply by email within two business days.</p>
                <button className={`${buttonCls("outline")} mt-8`} onClick={() => setSent(false)}>Send another message</button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="grid gap-8 border border-border bg-card p-8 shadow-card md:grid-cols-2 md:p-12">
                <Field label="Full name" name="name" error={errors["name"]}><input id="name" name="name" autoComplete="name" className={field} /></Field>
                <Field label="Email" name="email" error={errors["email"]}><input id="email" name="email" type="email" autoComplete="email" className={field} /></Field>
                <Field label="Phone (optional)" name="phone"><input id="phone" name="phone" type="tel" autoComplete="tel" className={field} /></Field>
                <Field label="Topic" name="topic" error={errors["topic"]}>
                  <select id="topic" name="topic" defaultValue="" className={field}>
                    <option value="" disabled>Choose a topic</option>
                    {products.map((p) => <option key={p.slug}>{p.name}</option>)}
                    <option>General question</option>
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Your message" name="message" error={errors["message"]}><textarea id="message" name="message" rows={5} className={field} placeholder="Your goal, an approximate amount and time horizonâ€¦" /></Field>
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-start gap-3 text-sm text-muted-foreground">
                    <input type="checkbox" name="consent" className="mt-1 size-4 accent-gold" aria-invalid={!!errors["consent"]} />
                    I agree that my details are processed to answer my enquiry, as described in the privacy policy.
                  </label>
                  {errors["consent"] && <p className="mt-2 text-xs text-destructive">{errors["consent"]}</p>}
                </div>
                <div className="md:col-span-2">
                  <button disabled={busy} className={buttonCls("navy")}>{busy ? "Sendingâ€¦" : "Send message"}</button>
                </div>
              </form>
            )}
          </Reveal>
        </div>
      </section>
      <section className="bg-secondary py-20 md:py-28">
        <div className="container-x grid gap-12 md:grid-cols-12">
          <h2 className="text-4xl md:col-span-5 md:text-5xl">Before you write.</h2>
          <div className="md:col-span-7"><Faq items={faqs} /></div>
        </div>
      </section>
    </>
  );
}

function Field({ label, name, error, children }: { label: string; name: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="eyebrow text-muted-foreground">{label}</label>
      {children}
      {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}

