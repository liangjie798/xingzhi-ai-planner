import type { Metadata } from "next";
import localFont from "next/font/local";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "./globals.css";
import "./workspace-refresh.css";
import "./product-ui.css";
import "./interaction-refresh.css";
import { RouteMotion } from "@/components/route-motion";

const interfaceFont = localFont({ src: "./fonts/geist-latin.woff2", display: "swap", variable: "--font-interface" });

export const metadata: Metadata = {
  title: "行知 · AI 活动与旅行规划",
  description: "通过对话确认目的地、日期与参与人群，结合真实环境数据，生成图文旅行规划与按时间执行的活动方案。",
  openGraph: {
    title: "行知 · 让每次出发，都有准备",
    description: "一起看天气、排日程，把一句想法变成可执行的旅行与活动规划。",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "https://lht574.cn/images/xingzhi-landscape.webp", alt: "行知 · 绿色山谷与蜿蜒河流" }],
  },
  twitter: { card: "summary_large_image", title: "行知 · 让每次出发，都有准备", images: ["https://lht574.cn/images/xingzhi-landscape.webp"] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body className={interfaceFont.variable}>
        <Theme accentColor="jade" grayColor="slate" radius="large" scaling="100%">
          <a href="#app-content" className="app-skip-link">跳到主要内容</a>
          <RouteMotion>{children}</RouteMotion>
        </Theme>
      </body>
    </html>
  );
}
