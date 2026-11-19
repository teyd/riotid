import Link from "next/link";
import { Code, Prose, Title } from "@/components/docs/prose";
import { Faq } from "@/learn/faq";
import { learnMeta, learnPage } from "@/learn/pages";

const HREF = "/docs/guides/button-hover/";
export const metadata = learnMeta(HREF, "zh");

export default function Page() {
  const page = learnPage(HREF);
  return (
    <Prose>
      <Title lead="默认情况下，悬停在图标本身或图标获得键盘焦点时才播放动效。在按钮、链接或卡片中，图标只占很小一块区域，由整个控件触发动效会更自然。">
        {page.zhTitle}
      </Title>
      <h2>先标记控件，再设置图标</h2>
      <p>给负责触发动效的元素加上 <code>data-kubai-trigger</code>，给图标设置 <code>trigger=&quot;parent&quot;</code>。图标会监听最近的带有 <code>data-kubai-trigger</code> 的祖先元素；如果没有这样的元素，就监听它的直接父元素。</p>
      <Code lang="tsx" code={`import { Trash } from "kubai-icons-react";

export function DeleteButton() {
  return (
    <button data-kubai-trigger className="btn">
      <Trash size={18} trigger="parent" />
      Delete
    </button>
  );
}`} />
      <p>Vue 中的写法相同：</p>
      <Code lang="vue" code={`<script setup>
import { Trash } from "kubai-icons-vue";
</script>

<template>
  <button data-kubai-trigger class="btn">
    <Trash :size="18" trigger="parent" />
    Delete
  </button>
</template>`} />
      <p>使用 Web Component 时：</p>
      <Code lang="html" code={`<a href="/settings" data-kubai-trigger>
  <kubai-icon name="settings" size="18" trigger="parent"></kubai-icon>
  Settings
</a>`} />
      <h2>卡片和列表行</h2>
      <p>被标记的元素可以很大，例如一张卡片、表格的一行或一个菜单项。其中所有设置了 <code>trigger=&quot;parent&quot;</code> 的图标会一起播放。</p>
      <Code lang="tsx" code={`import { CalendarCheck, Mail } from "kubai-icons-react";

export function InviteCard() {
  return (
    <a href="/invites/42" data-kubai-trigger className="card">
      <CalendarCheck size={28} trigger="parent" />
      <p>Team review, Friday 10:00</p>
      <Mail size={18} trigger="parent" />
    </a>
  );
}`} />
      <h2>原生 JavaScript</h2>
      <p>使用 <code>createIcon</code> 时，传入 <code>trigger: &quot;parent&quot;</code>，并在创建图标的同一个任务中把它添加到页面上，因为图标会在这个任务结束后立即查找触发元素：</p>
      <Code lang="js" code={`import { createIcon, Download } from "kubai-icons";

const button = document.querySelector("#export");
button.setAttribute("data-kubai-trigger", "");
button.prepend(createIcon(Download, { size: 18, trigger: "parent" }));`} />
      <p>如果图标要稍后再添加，请使用 <code>animate</code> 和 <code>bindTrigger</code>。详见 <Link href="/zh/docs/javascript/">JavaScript</Link>。</p>
      <h2>由应用自己的状态控制</h2>
      <p>如果动效要跟随悬停以外的状态，例如面板展开或文件拖到放置区域上方，请设置 <code>trigger=&quot;none&quot;</code>，再通过 <code>hover</code> prop 控制。<code>true</code> 播放动效，<code>false</code> 反向播放。</p>
      <Code lang="tsx" code={`import { useState } from "react";
import { Folder } from "kubai-icons-react";

export function DropZone() {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragEnter={() => setOver(true)}
      onDragLeave={() => setOver(false)}
      onDrop={() => setOver(false)}
    >
      <Folder size={40} trigger="none" hover={over} />
      Drop files here
    </div>
  );
}`} />
      <h2>键盘、触屏和切换型图标</h2>
      <ul>
        <li>被标记的元素获得键盘焦点时，会像悬停一样播放动效。鼠标点击后留下的焦点不会触发。</li>
        <li>在触屏设备上，点按一次会正向播放动效，然后反向播放回到原状。</li>
        <li>切换型图标（例如 <code>Bookmark</code>）在被标记的元素被点击时切换状态。可以用 <code>active</code> 和 <code>onActiveChange</code>（Vue 中用 <code>v-model:active</code>）在应用中保存这个状态。</li>
        <li>设置了 <code>prefers-reduced-motion</code> 时，图标直接切换到结束状态。</li>
      </ul>
      <Faq
        heading="常见问题"
        items={[
          { q: "为什么在按钮里悬停图标时，图标没有动？", a: "有些组件库会给按钮内的图标设置 `pointer-events: none`，图标因此收不到悬停事件。给按钮加上 `data-kubai-trigger`，给图标设置 `trigger=\"parent\"`，就会改由按钮触发动效。" },
          { q: "如果没有元素带 `data-kubai-trigger` 会怎样？", a: "设置了 `trigger=\"parent\"` 的图标会监听它的直接父元素。" },
          { q: "一次悬停可以让多个图标一起播放吗？", a: "可以。同一个被标记元素内所有设置了 `trigger=\"parent\"` 的图标，会在该元素被悬停或获得焦点时一起播放。" },
          { q: "可以完全关闭某个图标的动效吗？", a: "可以。设置 `trigger=\"none\"`，并且不传 `hover` prop，图标会一直保持静止状态。" },
        ]}
      />
    </Prose>
  );
}
