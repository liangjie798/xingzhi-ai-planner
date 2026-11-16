import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "管理员登录 · 行知",
  robots: { index: false, follow: false },
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
