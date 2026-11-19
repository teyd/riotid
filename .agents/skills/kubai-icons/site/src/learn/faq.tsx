import { Fragment } from "react";
import { JsonLd } from "@/components/json-ld";
import { cn } from "@/lib/utils";
import { PageSection } from "./ui";

export type Qa = { q: string; a: string };

/** Text with `code` spans, as plain text for structured data. */
const plain = (text: string) => text.replace(/`/g, "");

/** Text with `code` spans, rendered. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) =>
        i % 2 ? <code key={i} className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-code [overflow-wrap:anywhere]">{part}</code> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

/** Questions and answers, shown on the page and given to search engines as an FAQ. A grid lays them out as cards across a full-width page. */
export function Faq({ items, heading, className, grid = false }: { items: Qa[]; heading: string; className?: string; grid?: boolean }) {
  return (
    <PageSection title={heading} className={className}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map((i) => ({ "@type": "Question", name: plain(i.q), acceptedAnswer: { "@type": "Answer", text: plain(i.a) } })),
        }}
      />
      <div className={grid ? "grid gap-3 md:grid-cols-2" : "divide-y rounded-card border"}>
        {items.map((i) => (
          <div key={i.q} className={cn("space-y-1.5 p-4", grid && "rounded-card border")}>
            <h3 className="!mt-0 text-body font-semibold text-foreground"><Inline text={i.q} /></h3>
            <p className="text-body text-muted-foreground"><Inline text={i.a} /></p>
          </div>
        ))}
      </div>
    </PageSection>
  );
}
