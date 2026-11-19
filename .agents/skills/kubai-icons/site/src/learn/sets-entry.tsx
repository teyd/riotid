"use client";
import Link from "next/link";
import { RiArrowRightSLine } from "@remixicon/react";
import { chip, navItem } from "@/components/kit/styles";
import { hasIconPages, localize } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";

/** The icon library's link to the icon sets, as a sidebar row or a chip; English and Chinese only. */
export function SetsEntry({ as }: { as: "nav" | "chip" }) {
  const locale = useLocale();
  if (!hasIconPages(locale)) return null;
  const label = locale === "zh" ? "图标合集" : "Icon sets";
  const href = localize("/icons/sets/", locale);
  if (as === "chip") return <Link href={href} className={cn(chip(), "border")}>{label}</Link>;
  return (
    <>
      <Link href={href} className={cn(navItem({ active: false }), "justify-between")}>
        <span className="truncate">{label}</span>
        <RiArrowRightSLine aria-hidden className="size-4 shrink-0 rtl:rotate-180" />
      </Link>
      <div aria-hidden className="mx-2.5 my-2 border-t" />
    </>
  );
}
