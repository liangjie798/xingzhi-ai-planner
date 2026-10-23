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
  return <p className="welcome-greeting">{account.role === "GUEST" ? "欢迎体验行知。把出行想法告诉我，我们一起开始规划。" : `欢迎回来，${account.displayName || account.username}。${["ADMIN", "SUPER_ADMIN"].includes(account.role) ? "今天的平台动态已为你准备好。" : "一起把今天的想法，变成下一份计划。"}`}</p>;
}
