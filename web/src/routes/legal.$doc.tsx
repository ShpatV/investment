import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageHero } from "@/components/site/ui";
import { legalDocs } from "@/lib/site";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/legal/$doc")({
  loader: ({ params }) => {
    const d = legalDocs[params.doc];
    if (!d) throw notFound();
    return { doc: d, key: params.doc };
  },
  head: ({ loaderData }) => {
    const d = loaderData?.doc;
    if (!d) return { meta: [{ title: "Unavailable — Avencrestcorp" }, { name: "robots", content: "noindex" }] };
    return {
      meta: [
        { title: `${d.title} — Avencrestcorp` },
        { name: "description", content: `${d.title} for the Avencrestcorp website.` },
        { property: "og:title", content: `${d.title} — Avencrestcorp` },
        { property: "og:description", content: `${d.title} for the Avencrestcorp website.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: Legal,
});

function Legal() {
  const loaded = Route.useLoaderData();
  const params = Route.useParams();
  const key = loaded?.key ?? params.doc;
  const doc = loaded?.doc ?? legalDocs[key];
  if (!doc) throw notFound();
  return (
    <>
      <PageHero eyebrow={`Last updated ${doc.updated}`} title={doc.title} />
      <section className="py-20">
        <div className="container-x grid gap-16 md:grid-cols-12">
          <nav aria-label="Legal documents" className="md:col-span-3">
            <ul className="space-y-1 md:sticky md:top-28">
              {Object.entries(legalDocs).map(([k, d]) => (
                <li key={k}>
                  <Link to="/legal/$doc" params={{ doc: k }} className={cn("block border-l-2 py-2 pl-4 text-sm transition-colors", k === key ? "border-gold font-semibold" : "border-border text-muted-foreground hover:text-foreground")}>{d.title}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <article className="max-w-2xl md:col-span-9">
            {doc.sections.map((s, i) => (
              <section key={s.h} className="border-b border-border py-8 first:pt-0">
                <h2 className="text-3xl"><span className="mr-4 text-gold">§{i + 1}</span>{s.h}</h2>
                <p className="mt-4 leading-relaxed text-muted-foreground">{s.p}</p>
              </section>
            ))}
          </article>
        </div>
      </section>
    </>
  );
}

