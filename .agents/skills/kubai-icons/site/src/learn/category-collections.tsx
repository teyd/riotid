import Link from "next/link";
import { iconsIn } from "@/lib/catalog";
import { hasIconPages, localize, type Locale } from "@/lib/i18n";
import { COLLECTIONS } from "./collections";
import { PageSection, SetCards } from "./ui";

/** The icon sets that share the most icons with a category, on English and Chinese pages. */
export function CategoryCollections({ id, locale }: { id: string; locale: Locale }) {
  if (!hasIconPages(locale)) return null;
  const names = new Set(iconsIn(id).map((i) => i.name));
  const picks = COLLECTIONS.map((c) => ({ c, shared: c.icons.filter((n) => names.has(n)).length }))
    .filter((x) => x.shared >= 3)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, 3)
    .map(({ c }) => c);
  if (!picks.length) return null;
  const zh = locale === "zh";
  return (
    <PageSection
      title={zh ? "相关合集" : "Related icon sets"}
      action={<Link href={localize("/icons/sets/", locale)} className="text-control text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{zh ? "全部合集" : "All icon sets"}</Link>}
    >
      <SetCards sets={picks} locale={locale} />
    </PageSection>
  );
}
