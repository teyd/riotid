import Link from "next/link";
import { Code, Prose, Title } from "@/components/docs/prose";
import { Faq } from "@/learn/faq";
import { learnMeta, learnPage } from "@/learn/pages";

const HREF = "/docs/guides/nuxt/";
export const metadata = learnMeta(HREF, "en");

export default function Page() {
  const page = learnPage(HREF);
  return (
    <Prose>
      <Title lead="kubai-icons-vue provides each icon as a Vue component. It requires Vue 3.3 or later and works in Nuxt with server rendering: the SVG renders on the server, and the hover motion is added on the client.">
        {page.title}
      </Title>
      <h2>Install</h2>
      <Code lang="bash" code="npm install kubai-icons-vue" />
      <h2>Use an icon in a component</h2>
      <p>Import icons by name in <code>&lt;script setup&gt;</code>. The same code works in a Vite app and in a Nuxt page or component:</p>
      <Code lang="vue" code={`<script setup>
import { Folder, BellOff } from "kubai-icons-vue";
</script>

<template>
  <Folder :size="28" color="#6366F1" />
  <BellOff variant="soft" title="Muted" />
</template>`} />
      <p>The props are <code>size</code>, <code>color</code>, <code>variant</code>, <code>badgeColor</code>, <code>trigger</code>, <code>hover</code>, <code>active</code>, <code>defaultActive</code> and <code>title</code>. Without a <code>title</code>, an icon is hidden from screen readers. Classes and other attributes pass through to the <code>&lt;svg&gt;</code>.</p>
      <h2>Register icons globally in Nuxt</h2>
      <p>Nuxt auto-imports components from your own <code>components/</code> folder, not from packages. Import icons where you use them, or register the ones you use often in a plugin:</p>
      <Code lang="ts" code={`// plugins/kubai-icons.ts
import { Folder, Inbox, Settings } from "kubai-icons-vue";

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.component("FolderIcon", Folder);
  nuxtApp.vueApp.component("InboxIcon", Inbox);
  nuxtApp.vueApp.component("SettingsIcon", Settings);
});`} />
      <p>Register only the icons you need. Each icon is its own module, so the bundle carries only those.</p>
      <h2>Play the motion when a link is hovered</h2>
      <p>Add <code>data-kubai-trigger</code> to the link and <code>trigger=&quot;parent&quot;</code> to the icon. <code>NuxtLink</code> passes the attribute on to its <code>&lt;a&gt;</code>:</p>
      <Code lang="vue" code={`<script setup>
import { Settings } from "kubai-icons-vue";
</script>

<template>
  <NuxtLink to="/settings" data-kubai-trigger class="nav-link">
    <Settings :size="18" trigger="parent" />
    Settings
  </NuxtLink>
</template>`} />
      <p>More patterns are in <Link href="/docs/guides/button-hover/">Play an icon&apos;s animation when its button is hovered</Link>.</p>
      <h2>Toggle icons with v-model</h2>
      <p>Toggle icons, such as <code>Bookmark</code>, switch between two states when clicked or tapped. Bind the state with <code>v-model:active</code>:</p>
      <Code lang="vue" code={`<script setup>
import { ref } from "vue";
import { Bookmark } from "kubai-icons-vue";

const saved = ref(false);
</script>

<template>
  <button data-kubai-trigger :aria-pressed="saved">
    <Bookmark v-model:active="saved" trigger="parent" />
    {{ saved ? "Saved" : "Save" }}
  </button>
</template>`} />
      <h2>Icons chosen at runtime</h2>
      <p>When the icon name comes from data, use <code>DynamicIcon</code>. It loads each icon as a separate chunk. It renders an empty placeholder on the server and loads the icon in the browser, so prefer named imports for icons that are always shown.</p>
      <Code lang="vue" code={`<script setup>
import { DynamicIcon } from "kubai-icons-vue/dynamic";

defineProps({ name: String });
</script>

<template>
  <DynamicIcon :name="name" />
</template>`} />
      <h2>The soft variant for a whole page</h2>
      <p>The variant is inherited. Bind <code>VARIANTS.soft</code> to a root element, and every icon inside uses it unless it sets its own <code>variant</code>:</p>
      <Code lang="vue" code={`<script setup>
import { VARIANTS } from "kubai-icons-vue";
</script>

<template>
  <div :style="VARIANTS.soft">
    <NuxtPage />
  </div>
</template>`} />
      <h2>Faster dev server</h2>
      <p>A dev server may load the package index, which references every icon. Import each icon from its own file to avoid that:</p>
      <Code lang="js" code={`import Folder from "kubai-icons-vue/icons/folder";`} />
      <Faq
        heading="Questions"
        items={[
          { q: "Do the icons work with Nuxt server rendering?", a: "Yes. The SVG markup renders on the server, so icons are in the first HTML. Motion is added on the client after hydration. `DynamicIcon` is the exception: it renders an empty placeholder on the server." },
          { q: "Which Vue version do I need?", a: "Vue 3.3 or later. Current Nuxt releases already include a newer Vue." },
          { q: "How do I change an icon's color?", a: "Set the `color` prop, or set the CSS `color` on the icon or any parent. Every tone of the icon is calculated from that one color." },
          { q: "Can I control the motion from my own state?", a: "Yes. Set `trigger=\"none\"` and bind the `hover` prop: `true` plays the motion and `false` reverses it." },
        ]}
      />
    </Prose>
  );
}
