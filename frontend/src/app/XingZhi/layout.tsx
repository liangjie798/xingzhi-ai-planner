import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "工作台 · 行知",
  robots: { index: false, follow: false },
};

export default function XingZhiLayout({ children }: { children: React.ReactNode }) {
  return children;
}
