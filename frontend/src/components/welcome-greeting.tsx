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
  return <div className="welcome-greeting"><strong className="welcome-brush">{account.role === "GUEST" ? "初次相见，幸会行知" : "山海有约，欢迎归来"}</strong><p>{account.role === "GUEST" ? "把出行想法告诉我，我们一起开始规划。" : `${account.displayName || account.username}，一起把今天的想法，写成下一份计划。`}</p><span className="welcome-seal" aria-hidden="true">行知</span></div>;
}
