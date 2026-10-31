"use client";

import { useEffect, useState } from "react";
import { currentUser, type AccountUser } from "@/lib/auth";

export function WelcomeGreeting({ user }: { user?: AccountUser | null }) {
  const [sessionUser, setSessionUser] = useState<AccountUser | null>(null);
  useEffect(() => {
    if (user !== undefined) return;
    let active = true;
    void currentUser().then((value) => { if (active) setSessionUser(value); }).catch(() => {});
    return () => { active = false; };
  }, [user]);
  const account = user === undefined ? sessionUser : user;
  if (!account) return null;
  const admin = ["ADMIN", "SUPER_ADMIN"].includes(account.role);
  return <div className="welcome-greeting"><strong className="welcome-brush">{admin ? "平台概览，尽在这里。" : "下一次出发，想去哪里？"}</strong><p>{admin ? `${account.displayName || account.username}，在这里查看平台的注册、搜索与使用情况。` : account.role === "GUEST" ? "先说一个想法，目的地、日期和同行人，我们一起慢慢确认。" : `${account.displayName || account.username}，说说你的目的地，或今天想组织的活动。`}</p></div>;
}
