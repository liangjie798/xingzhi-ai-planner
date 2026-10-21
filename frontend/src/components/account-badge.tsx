"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { currentUser, type AccountUser } from "@/lib/auth";

export function AccountBadge() {
  const [user, setUser] = useState<AccountUser | null>(null);
  useEffect(() => { void currentUser().then(setUser).catch(() => setUser(null)); }, []);
  const initials = user?.displayName?.slice(0, 2).toUpperCase() || "登录";
  const isAdmin = user ? ["ADMIN", "SUPER_ADMIN"].includes(user.role) : false;
  const href = isAdmin ? "/admin" : user?.role === "USER" ? "/account" : "/login";
  return <Link className={`avatar ${user ? "is-authenticated" : ""}`} href={href} title={user ? `${user.displayName} · ${isAdmin ? "管理中心" : user.role === "GUEST" ? "访客会话" : "账户中心"}` : "登录后保存决策"}>{initials}</Link>;
}
