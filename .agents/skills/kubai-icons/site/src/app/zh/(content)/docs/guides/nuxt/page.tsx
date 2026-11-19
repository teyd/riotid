import Link from "next/link";
import { Code, Prose, Title } from "@/components/docs/prose";
import { Faq } from "@/learn/faq";
import { learnMeta, learnPage } from "@/learn/pages";

const HREF = "/docs/guides/nuxt/";
export const metadata = learnMeta(HREF, "zh");

export default function Page() {
  const page = learnPage(HREF);
  return (
    <Prose>
      <Title lead="kubai-icons-vue 将每个图标封装为一个 Vue 组件，要求 Vue 3.3 或更高版本，并支持 Nuxt 服务端渲染：SVG 在服务端渲染，悬停动效在客户端添加。">
        {page.zhTitle}
      </Title>
      <h2>安装</h2>
      <Code lang="bash" code="npm install kubai-icons-vue" />
      <h2>在组件中使用</h2>
      <p>在 <code>&lt;script setup&gt;</code> 中按名称导入图标。同样的代码可以用于 Vite 应用，也可以用于 Nuxt 的页面或组件：</p>
      <Code lang="vue" code={`<script setup>
import { Folder, BellOff } from "kubai-icons-vue";
</script>

<template>
  <Folder :size="28" color="#6366F1" />
  <BellOff variant="soft" title="Muted" />
</template>`} />
      <p>可用的 props 有 <code>size</code>、<code>color</code>、<code>variant</code>、<code>badgeColor</code>、<code>trigger</code>、<code>hover</code>、<code>active</code>、<code>defaultActive</code> 和 <code>title</code>。不设置 <code>title</code> 时，图标对屏幕阅读器隐藏。class 和其他属性会透传给 <code>&lt;svg&gt;</code>。</p>
      <h2>在 Nuxt 中全局注册</h2>
      <p>Nuxt 只会自动导入你自己 <code>components/</code> 目录中的组件，不会自动导入软件包中的组件。可以在用到的地方导入图标，也可以把常用的图标在插件中注册：</p>
      <Code lang="ts" code={`// plugins/kubai-icons.ts
import { Folder, Inbox, Settings } from "kubai-icons-vue";

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.component("FolderIcon", Folder);
  nuxtApp.vueApp.component("InboxIcon", Inbox);
  nuxtApp.vueApp.component("SettingsIcon", Settings);
});`} />
      <p>只注册需要的图标即可。每个图标都是独立的模块，打包结果中只会包含这些图标。</p>
      <h2>悬停链接时播放动效</h2>
      <p>给链接加上 <code>data-kubai-trigger</code>，给图标设置 <code>trigger=&quot;parent&quot;</code>。<code>NuxtLink</code> 会把这个属性传给它渲染的 <code>&lt;a&gt;</code>：</p>
      <Code lang="vue" code={`<script setup>
import { Settings } from "kubai-icons-vue";
</script>

<template>
  <NuxtLink to="/settings" data-kubai-trigger class="nav-link">
    <Settings :size="18" trigger="parent" />
    Settings
  </NuxtLink>
</template>`} />
      <p>更多写法见<Link href="/zh/docs/guides/button-hover/">悬停按钮时播放图标动效</Link>。</p>
      <h2>用 v-model 绑定切换型图标</h2>
      <p>切换型图标（例如 <code>Bookmark</code>）在点击或点按时切换两种状态。用 <code>v-model:active</code> 绑定这个状态：</p>
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
      <h2>运行时决定的图标</h2>
      <p>图标名称来自数据时，使用 <code>DynamicIcon</code>，它会把每个图标作为单独的代码块加载。它在服务端只渲染一个空占位，在浏览器中再加载图标，所以始终显示的图标仍建议按名称导入。</p>
      <Code lang="vue" code={`<script setup>
import { DynamicIcon } from "kubai-icons-vue/dynamic";

defineProps({ name: String });
</script>

<template>
  <DynamicIcon :name="name" />
</template>`} />
      <h2>整页使用 soft 样式</h2>
      <p>样式会向下继承。把 <code>VARIANTS.soft</code> 绑定到一个根元素上，其中的所有图标都会使用它，除非图标自己设置了 <code>variant</code>：</p>
      <Code lang="vue" code={`<script setup>
import { VARIANTS } from "kubai-icons-vue";
</script>

<template>
  <div :style="VARIANTS.soft">
    <NuxtPage />
  </div>
</template>`} />
      <h2>加快开发服务器</h2>
      <p>开发服务器可能会加载引用了所有图标的软件包入口。从每个图标自己的文件导入可以避免这一点：</p>
      <Code lang="js" code={`import Folder from "kubai-icons-vue/icons/folder";`} />
      <Faq
        heading="常见问题"
        items={[
          { q: "图标支持 Nuxt 服务端渲染吗？", a: "支持。SVG 在服务端渲染，首屏 HTML 中就有图标，动效在客户端水合后添加。`DynamicIcon` 例外：它在服务端只渲染一个空占位。" },
          { q: "需要哪个 Vue 版本？", a: "Vue 3.3 或更高版本。目前的 Nuxt 版本自带的 Vue 已经满足要求。" },
          { q: "怎样修改图标颜色？", a: "设置 `color` prop，或者在图标及其任意父元素上设置 CSS `color`。图标的所有色调都由这一个颜色计算得出。" },
          { q: "可以用自己的状态控制动效吗？", a: "可以。设置 `trigger=\"none\"`，再绑定 `hover` prop：`true` 播放动效，`false` 反向播放。" },
        ]}
      />
    </Prose>
  );
}
