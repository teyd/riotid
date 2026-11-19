import type { Metadata } from "next";
import { SetPageBody, setMeta } from "@/learn/set-page";
import { COLLECTIONS } from "@/learn/collections";

export const dynamicParams = false;
export const generateStaticParams = () => COLLECTIONS.map((c) => ({ id: c.id }));

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return setMeta((await params).id, "en");
}

export default async function Page({ params }: Props) {
  return <SetPageBody id={(await params).id} locale="en" />;
}
