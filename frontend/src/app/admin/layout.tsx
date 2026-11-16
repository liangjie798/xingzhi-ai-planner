import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "运营管理 · 行知",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
