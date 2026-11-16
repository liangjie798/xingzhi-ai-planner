import type { Metadata } from "next";

const shareImage = { url: "https://lht574.cn/images/xingzhi-share.jpg", width: 1200, height: 630, type: "image/jpeg", alt: "行知 · 绿色山谷与蜿蜒河流" };
const description = "登录行知，保存旅行与活动规划记录；也可以免注册以访客身份体验。";

export const metadata: Metadata = {
  title: "登录 · 行知",
  description,
  alternates: { canonical: "/login" },
  openGraph: { title: "登录 · 行知", description, url: "/login", images: [shareImage] },
  twitter: { card: "summary_large_image", title: "登录 · 行知", description, images: [shareImage.url] },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
