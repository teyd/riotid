import Link from "next/link";
import { Code, Prose, Title } from "@/components/docs/prose";
import { Faq } from "@/learn/faq";
import { learnMeta, learnPage } from "@/learn/pages";

const HREF = "/docs/guides/nextjs/";
export const metadata = learnMeta(HREF, "zh");

export default function Page() {
  const page = learnPage(HREF);
  return (
    <Prose>
      <Title lead="kubai-icons-react 可以直接用于 App Router 和 Pages Router，无需任何配置。图标在服务端渲染为 SVG，首屏 HTML 中就有图标，悬停动效在水合后添加。">
        {page.zhTitle}
      </Title>
      <h2>安装</h2>
      <Code lang="bash" code="npm install kubai-icons-react" />
      <h2>在 Server Component 中使用</h2>
      <p>按名称导入图标即可。页面和布局可以保持为 Server Component：每个图标都是独立的客户端模块，只有实际渲染的图标会发送到浏览器。</p>
      <Code lang="tsx" code={`// app/page.tsx
import { Folder, Bell } from "kubai-icons-react";

export default function Home() {
  return (
    <main>
      <h1><Folder size={32} /> Projects</h1>
      <Bell color="#F59E0B" title="Notifications" />
    </main>
  );
}`} />
      <p>不设置 <code>title</code> 时，图标对屏幕阅读器隐藏。图标本身需要表达含义时（例如上面的铃铛），请加上 <code>title</code>。详见<Link href="/zh/docs/accessibility/">无障碍</Link>。</p>
      <h2>悬停链接时播放动效</h2>
      <p>默认情况下，悬停在图标本身或图标获得焦点时才播放动效。在导航链接中，由整个链接触发会更自然。给链接加上 <code>data-kubai-trigger</code>，并给图标设置 <code>trigger=&quot;parent&quot;</code>：</p>
      <Code lang="tsx" code={`import Link from "next/link";
import { Settings } from "kubai-icons-react";

export function SettingsLink() {
  return (
    <Link href="/settings" data-kubai-trigger className="flex items-center gap-2">
      <Settings size={18} trigger="parent" />
      Settings
    </Link>
  );
}`} />
      <h2>运行时决定的图标</h2>
      <p>图标名称来自数据（例如 CMS 或数据库）时，使用 <code>DynamicIcon</code>。它在首次显示某个图标时单独加载该图标的代码块。它在服务端只渲染一个空占位，所以始终显示在页面上的图标仍建议按名称导入。</p>
      <Code lang="tsx" code={`"use client";
import { DynamicIcon } from "kubai-icons-react/dynamic";

export function CategoryIcon({ name }: { name: string }) {
  return <DynamicIcon name={name} size={20} />;
}`} />
      <h2>加快开发服务器</h2>
      <p>开发环境下，<code>next dev</code> 可能会加载引用了所有图标的软件包入口。从每个图标自己的文件导入，可以避免这一点，热更新也更快：</p>
      <Code lang="tsx" code={`import Folder from "kubai-icons-react/icons/folder";`} />
      <p>生产构建无论哪种写法都会移除未使用的图标。详见<Link href="/zh/docs/performance/">性能</Link>。</p>
      <h2>颜色和主题</h2>
      <p>图标的颜色来自 <code>currentColor</code>，会跟随外层元素的文字颜色，深色模式下也一样。要让整个应用使用 soft 样式，在 <code>&lt;body&gt;</code> 上设置一次即可。详见<Link href="/zh/docs/guides/colors-dark-mode/">颜色和深色模式</Link>。</p>
      <Faq
        heading="常见问题"
        items={[
          { q: "图标需要加 `\"use client\"` 吗？", a: "不需要。每个图标模块已经声明为客户端模块，可以直接在 Server Component 中导入。只有你自己写的、用到 hooks 或 `DynamicIcon` 的组件才需要这条指令。" },
          { q: "图标会造成布局偏移吗？", a: "不会。SVG 在服务端 HTML 中就是最终尺寸，动效只改变 SVG 内部的形状。" },
          { q: "动效会遵循“减弱动态效果”设置吗？", a: "会。设置了 `prefers-reduced-motion` 时，图标直接切换到结束状态，不播放动画。" },
          { q: "一个图标会让打包体积增加多少？", a: "压缩并 gzip 后，第一个图标连同共享运行时约 4 KB，之后每个图标约 0.6 KB。" },
        ]}
      />
    </Prose>
  );
}
