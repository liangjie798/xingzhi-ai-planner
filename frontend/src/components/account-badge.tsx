"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { currentUser, type AccountUser } from "@/lib/auth";

export function AccountBadge() {
  const [user, setUser] = useState<AccountUser | null>(null);
  useEffect(() => { void currentUser().then(setUser).catch(() => setUser(null)); }, []);
  const initials = user?.displayName?.slice(0, 2).toUpperCase() || "登录";
  return <Link className={`avatar ${user ? "is-authenticated" : ""}`} href={user ? "/account" : "/login"} title={user ? `${user.displayName} · 账户中心` : "登录后保存决策"}>{initials}</Link>;
}
