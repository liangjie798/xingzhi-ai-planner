"use client";

import { ArrowLeft, ClockCounterClockwise, Compass, SignOut, Sparkle } from "@phosphor-icons/react";
import Link from "next/link";
import { WelcomeGreeting } from "@/components/welcome-greeting";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { currentUser, decisionHistory, logout, type AccountUser, type DecisionHistoryItem } from "@/lib/auth";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [items, setItems] = useState<DecisionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void Promise.all([currentUser(), decisionHistory()]).then(([nextUser, history]) => { if (!nextUser) return router.replace("/login"); setUser(nextUser); setItems(history); }).catch(() => router.replace("/login")).finally(() => setLoading(false)); }, [router]);
  async function signOut() {
    await logout();
    // A full navigation clears cached credentials and pending form state after logout.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  return <main className="account-page">
    <header className="account-topbar"><Link href="/XingZhi"><ArrowLeft size={17} />返回工作台</Link><span><Compass size={21} weight="duotone" />行知</span><button onClick={signOut}><SignOut size={17} />退出登录</button></header>
    <div className="account-body"><WelcomeGreeting user={user} />
      <section className="account-hero"><div className="account-monogram">{user?.displayName?.slice(0, 2) || "SH"}</div><div><span className="section-kicker">{user?.role === "SUPER_ADMIN" ? "超级管理员账户" : user?.role === "ADMIN" ? "管理员账户" : "个人账户"}</span><h1>{user?.displayName || "正在读取账户"}</h1><p>@{user?.username || "--"} · 登录后生成的决策会自动保存在这里</p></div></section>
      <section className="history-section"><div className="history-heading"><div><span className="section-kicker">决策档案</span><h2>最近 50 次活动判断</h2></div><Link href="/XingZhi"><Sparkle size={17} />新建决策</Link></div>
        {loading ? <div className="history-empty"><span className="button-loader dark" />正在读取记录</div> : items.length === 0 ? <div className="history-empty"><ClockCounterClockwise size={30} /><strong>还没有已保存的决策</strong><span>前往工作台生成第一份活动方案。</span></div> : <div className="history-list">{items.map((item) => <article key={item.id}><div className={`history-score level-${item.overallLevel}`}><strong>{item.overallScore}</strong><span>{item.overallLevel}</span></div><div><span>{item.activityType} · {item.cityId}</span><h3>{item.summary}</h3><time>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></div></article>)}</div>}
      </section>
    </div>
  </main>;
}
