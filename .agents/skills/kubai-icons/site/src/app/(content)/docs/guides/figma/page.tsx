import Link from "next/link";
import { Code, Prose, Title } from "@/components/docs/prose";
import { Faq } from "@/learn/faq";
import { learnMeta, learnPage } from "@/learn/pages";

const HREF = "/docs/guides/figma/";
export const metadata = learnMeta(HREF, "en");

export default function Page() {
  const page = learnPage(HREF);
  return (
    <Prose>
      <Title lead="Design tools can't run the hover motion, so they use each icon's rest pose as a static file. The icon browser exports SVG and PNG files with plain hex colors, which Figma, Sketch and other design tools read correctly.">
        {page.title}
      </Title>
      <h2>Choose the color first</h2>
      <p>Open the <Link href="/icons/">icon browser</Link>. In the toolbar, pick the accent color, either a swatch or your own hex value, and the variant, <strong>Color</strong> or <strong>Soft</strong>. Every copy and download uses these settings, so set them before you export. <strong>Mixed</strong> gives each icon its own color from the palette.</p>
      <h2>Copy into Figma</h2>
      <p>Click an icon to open its panel, then click <strong>Copy SVG</strong>. Paste into Figma with <kbd>⌘V</kbd> or <kbd>Ctrl+V</kbd>: Figma turns pasted SVG markup into vector layers that you can resize and edit. Badged icons copy with the badge color chosen in the panel.</p>
      <h2>Download SVG or PNG</h2>
      <p>The same panel has two download buttons:</p>
      <ul>
        <li><strong>SVG</strong> downloads a vector file named after the icon, such as <code>folder.svg</code>. Use it in Figma, Sketch, Illustrator or anywhere that imports SVG.</li>
        <li><strong>PNG</strong> downloads a 512×512 image, for slides, documents and tools that don&apos;t accept SVG.</li>
      </ul>
      <p>Exported files include a small margin around the icon for its drop shadow.</p>
      <h2>Save a set as a ZIP</h2>
      <p>To export many icons at once, click the bookmark button in each icon&apos;s panel to save it to your collection. The collection stays in this browser. Once an icon is saved, a bar appears at the bottom of the page; click the saved count to open the collection, where you can:</p>
      <ul>
        <li>set one color, or Mixed, and one variant for every saved icon;</li>
        <li>choose SVG or PNG, then click <strong>Download ZIP</strong>;</li>
        <li>click <strong>Copy link</strong> to open the same collection on another device or share it with a teammate.</li>
      </ul>
      <p>Ready-made sets for common products are in <Link href="/icons/sets/">Collections</Link>.</p>
      <h2>Any color by URL</h2>
      <p>Every icon is also available as an SVG at a stable address, in any accent color. This suits tools that import images from a URL, and agents that can&apos;t install packages:</p>
      <Code lang="text" code={`https://icons.kubai.design/api/icon/folder.svg?color=EC4899&variant=soft&size=512`} />
      <ul>
        <li><code>color</code>: a six-digit hex value, with or without the <code>#</code>. Default: 5393FF.</li>
        <li><code>variant</code>: <code>color</code> or <code>soft</code>.</li>
        <li><code>badge</code>: <code>semantic</code> or a hex value, for badged icons.</li>
        <li><code>size</code>: width and height in pixels, from 16 to 2048. Default: 96.</li>
      </ul>
      <h2>Every icon as files</h2>
      <p>For a full local copy, for example to build an asset library or bundle icons into a native app, install the static package:</p>
      <Code lang="bash" code="npm install kubai-icons-static" />
      <p><code>svg/</code> holds every icon in the default blue (<code>#5393FF</code>) and <code>svg-soft/</code> every icon in the soft variant. <code>icons.json</code> lists each icon&apos;s category and tags. Each file includes a margin for the drop shadow, so to match an animated icon shown at 24px, place the file at 28px.</p>
      <Faq
        heading="Questions"
        items={[
          { q: "Is there a Figma plugin?", a: "No. Copy SVG from the icon browser and paste it into Figma, or import downloaded SVG files." },
          { q: "Do exported files keep the animation?", a: "No. SVG and PNG exports show the icon's rest pose. The motion runs only in the React, Vue and JavaScript packages and the web component." },
          { q: "Can I edit the icons and use them in commercial work?", a: "Yes. The icons are MIT licensed: you can use, change and redistribute them, commercially or not. Keep the copyright notice with the source files." },
          { q: "Why does a downloaded icon look smaller than the live one at the same size?", a: "Files include a margin for the drop shadow. A file shown at 28px matches a live icon at 24px." },
        ]}
      />
    </Prose>
  );
}
