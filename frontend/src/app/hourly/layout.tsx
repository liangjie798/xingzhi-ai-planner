import type { Metadata } from "next";

const shareImage = { url: "https://lht574.cn/images/xingzhi-share.jpg", width: 1200, height: 630, type: "image/jpeg", alt: "行知 · 绿色山谷与蜿蜒河流" };
const description = "按小时查看城市气温、湿度、降水概率与空气质量，比较一天中的活动适宜时段。";

export const metadata: Metadata = {
  title: "逐小时环境数据 · 行知",
  description,
  alternates: { canonical: "/hourly" },
  openGraph: { title: "逐小时环境数据 · 行知", description, url: "/hourly", images: [shareImage] },
  twitter: { card: "summary_large_image", title: "逐小时环境数据 · 行知", description, images: [shareImage.url] },
};

export default function HourlyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
