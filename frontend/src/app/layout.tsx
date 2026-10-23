import type { Metadata } from "next";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "./globals.css";
import "./workspace-refresh.css";

export const metadata: Metadata = {
  title: "适候 | AI 户外活动环境决策平台",
  description: "基于实时天气、空气质量与逐小时预报，为校园和社区户外活动生成可解释的时段决策。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>
        <Theme accentColor="jade" grayColor="slate" radius="large" scaling="100%">
          {children}
        </Theme>
      </body>
    </html>
  );
}
