import * as library from "kubai-icons";
import type { KubaiIconData } from "kubai-icons";
import { baseIcons } from "@/lib/catalog";
import { pascal } from "@/lib/icons";
import { mixedColor } from "@/lib/palette";

export const dynamic = "force-static";
export const dynamicParams = false;
export const generateStaticParams = () => baseIcons().map((i) => ({ name: i.name }));

// Pages of icon links show dozens of these, so browsers keep them a day and refresh them in
// the background for a week after, rather than asking again on every page.
const PREVIEW_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

// A standalone image of the icon at rest, in the colour the grid gives it.
export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const icon = (library as unknown as Record<string, KubaiIconData>)[pascal(name)];
  // WebKit renders masks in an SVG image at its intrinsic size, so that size stays generous.
  const svg = library.toSvg(icon, { color: mixedColor(name), size: 512, id: "k" });
  // Matches public/_headers, which sets the same caching for the exported files.
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": PREVIEW_CACHE } });
}
