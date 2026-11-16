import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI 模型配置 · 行知",
  description: "为账户绑定兼容 OpenAI 协议的模型服务，用于旅行与活动规划中的文字解释。",
  robots: { index: false, follow: false },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
