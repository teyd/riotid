import Link from "next/link";
import { Code, Prose, Title } from "@/components/docs/prose";
import { Faq } from "@/learn/faq";
import { learnMeta, learnPage } from "@/learn/pages";
import { pascal } from "@/lib/icons";

const HREF = "/docs/compare/lucide/";
export const metadata = learnMeta(HREF, "zh");

const FACTS: [string, string, string][] = [
  ["风格", "分层的彩色图标，带渐变、柔和阴影和高光", "线性图标，在 24×24 网格上用 2px 描边绘制"],
  ["悬停动效", "每个图标都内置动效：文件夹会打开，铃铛会摇动", "不内置动效，图标是静态 SVG"],
  ["图标数量", "900 多种物件，加上带角标和带斜线的版本共近 3,000 个", "1,600 个以上"],
  ["样式", "color 和 soft 两种样式，另有带角标（加号、对勾、叉号等）和带斜线的“关闭”版本", "一种样式，描边粗细可调"],
  ["颜色", "一个主色，所有色调都由它派生", "描边使用一种颜色"],
  ["软件包", "React、Vue、原生 JavaScript、Web Component 和静态 SVG", "React、React Native、Vue、Svelte、Preact、Solid、Angular、Astro、原生 JavaScript 和静态 SVG"],
  ["许可证", "MIT", "ISC"],
];

// The lucide-react export, the Kubai icon, and the icon's page when the Kubai icon is a badged version.
const NAMES: [string, string, string?][] = [
  ["House", "home"], ["Search", "search"], ["Settings", "settings"], ["User", "user"], ["Users", "users"],
  ["UserPlus", "user-plus", "user"], ["Mail", "mail"], ["Bell", "bell"], ["BellOff", "bell-off", "bell"], ["Calendar", "calendar"],
  ["Clock", "clock"], ["Trash", "trash"], ["Folder", "folder"], ["FolderOpen", "folder-open"], ["FileText", "file-text"],
  ["Download", "download"], ["Heart", "heart"], ["Star", "star"], ["Bookmark", "bookmark"], ["Lock", "lock"],
  ["LockOpen", "lock-open"], ["Key", "key"], ["Eye", "eye"], ["EyeOff", "eye-off", "eye"], ["Camera", "camera"],
  ["Image", "image"], ["Phone", "phone"], ["MessageCircle", "message-circle"], ["Send", "send"], ["Share2", "share"],
  ["MapPin", "map-pin"], ["Globe", "globe"], ["ShoppingCart", "shopping-cart"], ["CreditCard", "credit-card"], ["Gift", "gift"],
  ["Sun", "sun"], ["Moon", "moon"], ["Cloud", "cloud"], ["Terminal", "terminal"], ["Database", "database"],
  ["Menu", "menu"], ["Funnel", "filter"], ["Link", "link"], ["Pencil", "pencil"], ["Copy", "copy"],
  ["LogOut", "log-out"], ["CircleCheck", "circle-check"], ["Info", "info"], ["Rocket", "rocket"], ["Ellipsis", "more-horizontal"],
];

export default function Page() {
  const page = learnPage(HREF);
  return (
    <Prose>
      <Title lead="Lucide 是一套由社区维护的大型线性图标库。Kubai Icons 是一套数量较少的分层彩色图标，每个图标都有各自的悬停动效。两者都开源，都可以在 React、Vue 和纯 SVG 中使用。">
        {page.zhTitle}
      </Title>
      <h2>概览</h2>
      <table>
        <thead><tr><th /><th>Kubai Icons</th><th>Lucide</th></tr></thead>
        <tbody>
          {FACTS.map(([label, kubai, other]) => (
            <tr key={label}><td className="font-medium whitespace-nowrap text-foreground">{label}</td><td>{kubai}</td><td>{other}</td></tr>
          ))}
        </tbody>
      </table>
      <h2>适合选择 Lucide 的情况</h2>
      <ul>
        <li>界面使用细线图标，图标在文字旁边需要保持低调。</li>
        <li>需要的物件只有非常大的图标库才有，或者需要大量细分技术领域的图标。</li>
        <li>所用框架没有 Kubai Icons 的软件包，例如 React Native、Svelte 或 Angular。Web 端的框架可以使用 Kubai 的 Web Component。</li>
        <li>希望每个图标的代码尽量少：Lucide 图标只有几条描边路径，不需要运行时。</li>
      </ul>
      <h2>适合选择 Kubai Icons 的情况</h2>
      <ul>
        <li>希望图标有颜色和层次，同时彼此统一，全部由一个主色派生。</li>
        <li>希望不写代码就有悬停动效：每个图标都会演示物件本身的动作，时长约半秒。</li>
        <li>需要同一图形的相关状态，例如 <code>folder-plus</code>、<code>user-check</code> 或 <code>bell-off</code>。</li>
        <li>以后需要同一风格的新图标。<Link href="/zh/skill/">Kubai Icons Skill</Link> 可以让编程 Agent 绘制新图标。</li>
      </ul>
      <h2>从 Lucide 迁移</h2>
      <p>安装对应框架的软件包，以 React 为例：</p>
      <Code lang="bash" code="npm install kubai-icons-react" />
      <p>然后修改导入语句。两套图标都使用 PascalCase 的简短英文名称，所以很多名称相同：</p>
      <Code lang="tsx" code={`// 迁移前
import { House, Bell, Settings } from "lucide-react";

// 迁移后
import { Home, Bell, Settings } from "kubai-icons-react";`} />
      <p><code>size</code> 和 <code>color</code> 的用法相同：<code>size</code> 设置宽高（单位为像素），<code>color</code> 默认为 <code>currentColor</code>。Kubai 图标没有描边，所以去掉 <code>strokeWidth</code> 和 <code>absoluteStrokeWidth</code>。需要更浅的效果时，使用 <code>variant=&quot;soft&quot;</code>。<code>className</code> 等其他 SVG 属性会透传。详见 <Link href="/zh/docs/react/">React 的 Props</Link>。</p>
      <h2>名称对照表</h2>
      <p>常用 Lucide 图标对应的最接近的 Kubai 图标。较新的 lucide-react 也会以别名导出旧名称，例如 <code>AlertTriangle</code>。</p>
      <table>
        <thead><tr><th>lucide-react</th><th>kubai-icons-react</th></tr></thead>
        <tbody>
          {NAMES.map(([other, kubai, base]) => (
            <tr key={other}><td><code>{other}</code></td><td><Link href={`/zh/icons/${base ?? kubai}/`}><code>{pascal(kubai)}</code></Link></td></tr>
          ))}
        </tbody>
      </table>
      <p>其他图标可以在<Link href="/zh/icons/">图标库</Link>中按名称或含义搜索。</p>
      <Faq
        heading="常见问题"
        items={[
          { q: "可以在同一个项目里同时使用 Lucide 和 Kubai Icons 吗？", a: "可以。两个软件包互不依赖，可以逐个页面替换。两种风格放在一起差别明显，建议不要在同一个工具栏里混用。" },
          { q: "有类似 Lucide 的线性样式吗？", a: "没有。每个 Kubai 图标都是分层的彩色图形。`variant=\"soft\"` 是更浅的版本，填充更淡，轮廓更深。" },
          { q: "一个图标会让打包体积增加多少？", a: "压缩并 gzip 后，第一个 Kubai 图标连同共享运行时约 4 KB，之后每个图标约 0.6 KB。未导入的图标会被移除。" },
          { q: "可以在商业项目中使用 Kubai Icons 吗？", a: "可以。Kubai Icons 使用 MIT 许可证，Lucide 使用 ISC 许可证，两者都允许商业使用，只需保留许可证声明。" },
        ]}
      />
    </Prose>
  );
}
