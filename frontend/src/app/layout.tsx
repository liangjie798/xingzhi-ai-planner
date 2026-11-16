import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "./globals.css";
import "./workspace-refresh.css";
import "./product-ui.css";
import "./interaction-refresh.css";
import "./theme.css";
import { RouteMotion } from "@/components/route-motion";

const interfaceFont = localFont({ src: "./fonts/geist-latin.woff2", display: "swap", variable: "--font-interface" });

const siteDescription = "通过对话确认目的地、日期与参与人群，结合真实环境数据，生成图文旅行规划与按时间执行的活动方案。";

export const metadata: Metadata = {
  metadataBase: new URL("https://lht574.cn"),
  applicationName: "行知",
  title: "行知 · AI 活动与旅行规划",
  description: siteDescription,
  keywords: ["行知", "AI 规划", "旅行规划", "活动规划", "天气", "空气质量", "户外活动"],
  openGraph: {
    title: "行知 · 让每次出发，都有准备",
    description: "一起看天气、排日程，把一句想法变成可执行的旅行与活动规划。",
    locale: "zh_CN",
    siteName: "行知",
    type: "website",
    images: [{ url: "https://lht574.cn/images/xingzhi-share.jpg", width: 1200, height: 630, type: "image/jpeg", alt: "行知 · 绿色山谷与蜿蜒河流" }],
  },
  twitter: { card: "summary_large_image", title: "行知 · 让每次出发，都有准备", description: "一起看天气、排日程，把一句想法变成可执行的旅行与活动规划。", images: ["https://lht574.cn/images/xingzhi-share.jpg"] },
};

export const viewport: Viewport = {
  themeColor: "#12100d",
  colorScheme: "dark",
};

const structuredData = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://lht574.cn/#website",
      name: "行知",
      alternateName: "行知 · AI 活动与旅行规划",
      url: "https://lht574.cn/welcome",
      inLanguage: "zh-CN",
      description: siteDescription,
    },
    {
      "@type": "Organization",
      "@id": "https://lht574.cn/#organization",
      name: "行知",
      url: "https://lht574.cn/welcome",
      sameAs: ["https://github.com/liangjie798/xingzhi-ai-planner"],
    },
  ],
}).replace(/</g, "\\u003c");

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body className={interfaceFont.variable}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
        <Theme appearance="dark" accentColor="bronze" grayColor="sand" radius="large" scaling="100%">
          <a href="#app-content" className="app-skip-link">跳到主要内容</a>
          <RouteMotion>{children}</RouteMotion>
        </Theme>
      </body>
    </html>
  );
}
