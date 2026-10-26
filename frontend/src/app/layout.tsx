import type { Metadata } from "next";
import localFont from "next/font/local";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "./globals.css";
import "./workspace-refresh.css";
import "./product-ui.css";

const interfaceFont = localFont({ src: "./fonts/geist-latin.woff2", display: "swap", variable: "--font-interface" });

export const metadata: Metadata = {
  title: "行知 · AI 活动与旅行规划",
  description: "通过对话确认目的地、日期与参与人群，结合真实环境数据，生成图文旅行规划与按时间执行的活动方案。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body className={interfaceFont.variable}>
        <Theme accentColor="jade" grayColor="slate" radius="large" scaling="100%">
          {children}
        </Theme>
      </body>
    </html>
  );
}
