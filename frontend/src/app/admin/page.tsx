"use client";

import { ChartBar, Compass, LockSimple, MagnifyingGlass, SignOut, UsersThree } from "@phosphor-icons/react";
import { WelcomeGreeting } from "@/components/welcome-greeting";
import { AdminManagement } from "@/components/admin-management";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { adminData, currentUser, logout, type AccountUser, type AdminOverview, type AdminSearch } from "@/lib/auth";

export default function AdminPage() {
  const router = useRouter(); const [user, setUser] = useState<AccountUser | null>(null); const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [searches, setSearches] = useState<AdminSearch[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { void Promise.all([currentUser(), adminData()]).then(([nextUser, data]) => { if (!nextUser || !["ADMIN", "SUPER_ADMIN"].includes(nextUser.role)) return router.replace("/admin/login"); setUser(nextUser); setOverview(data[0]); setSearches(data[2]); }).catch(() => router.replace("/admin/login")).finally(() => setLoading(false)); }, [router]);
  async function signOut() {
    await logout();
    // A full navigation clears cached credentials and pending form state after logout.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/admin/login");
  }
  const format = (value: string) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  return <main className="account-page admin-page"><header className="account-topbar"><div className="admin-console-brand"><Compass size={21} weight="duotone" />行知管理平台</div><span><LockSimple size={17} />独立管理账户</span><button onClick={signOut}><SignOut size={17} />退出登录</button></header>
    <div className="admin-body"><WelcomeGreeting user={user} /><section className="admin-heading"><div><span className="section-kicker">PLATFORM MANAGEMENT</span><h1>用户与反馈管理</h1><p>{user?.displayName} · 管理用户账户、处理用户反馈，查看注册、搜索和使用统计。</p></div></section>
      <section className="admin-metrics"><article><UsersThree size={20} /><span>注册账户</span><strong>{overview?.registeredUsers ?? "--"}</strong></article><article><MagnifyingGlass size={20} /><span>城市搜索</span><strong>{overview?.searches ?? "--"}</strong></article><article><ChartBar size={20} /><span>决策生成</span><strong>{overview?.decisions ?? "--"}</strong></article></section>
      {!loading && user && <AdminManagement />}
      {loading ? <div className="history-empty"><span className="button-loader dark" />正在载入运营数据</div> : <div className="admin-search-records">
      <section className="admin-table-card"><div><span className="section-kicker">搜索数据</span><h2>最近 100 次城市检索</h2></div><div className="admin-table"><div className="admin-row search-row is-head"><span>关键词</span><span>身份</span><span>结果 / 时间</span></div>{searches.length === 0 ? <p className="admin-empty">暂无搜索记录</p> : searches.map((item) => <div className="admin-row search-row" key={item.id}><span><strong>{item.query}</strong><small>{item.username || "未登录"}</small></span><span className="role-chip">{item.actorType === "REGISTERED" ? "注册用户" : item.actorType === "GUEST" ? "访客" : "匿名"}</span><time>{item.resultCount} 条 · {format(item.createdAt)}</time></div>)}</div></section></div>}
    </div></main>;
}
