"use client";
import Link from "next/link";
import { hasIconPages, localize } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

const LINKS = [{ href: "/icons/sets/", label: "Icon sets", zh: "图标合集" }];

/** Footer links to the pages that exist only in English and Simplified Chinese. */
export function LearnFooterLinks({ className }: { className: string }) {
  const locale = useLocale();
  if (!hasIconPages(locale)) return null;
  return LINKS.map((l) => (
    <Link key={l.href} href={localize(l.href, locale)} className={className}>{locale === "zh" ? l.zh : l.label}</Link>
  ));
}
