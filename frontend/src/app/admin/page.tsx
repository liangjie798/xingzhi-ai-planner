"use client";

import { ArrowLeft, ChartBar, Compass, MagnifyingGlass, SignOut, Sparkle, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { adminData, currentUser, logout, type AccountUser, type AdminOverview, type AdminSearch, type AdminUser } from "@/lib/auth";

export default function AdminPage() {
  const router = useRouter(); const [user, setUser] = useState<AccountUser | null>(null); const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]); const [searches, setSearches] = useState<AdminSearch[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { void Promise.all([currentUser(), adminData()]).then(([nextUser, data]) => { if (nextUser?.role !== "ADMIN") return router.replace("/login"); setUser(nextUser); setOverview(data[0]); setUsers(data[1]); setSearches(data[2]); }).catch(() => router.replace("/login")).finally(() => setLoading(false)); }, [router]);
  async function signOut() {
    await logout();
    // A full navigation clears cached credentials and pending form state after logout.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
  const format = (value: string) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  return <main className="account-page admin-page"><header className="account-topbar"><Link href="/dashboard"><ArrowLeft size={17} />返回工作台</Link><span><Compass size={21} weight="duotone" />适候管理台</span><button onClick={signOut}><SignOut size={17} />退出登录</button></header>
    <div className="admin-body"><section className="admin-heading"><div><span className="section-kicker">ADMIN CONSOLE</span><h1>平台使用概览</h1><p>{user?.displayName} · 注册和行为数据只在管理员权限下展示</p></div><Link href="/dashboard"><Sparkle size={16} />进入决策工作台</Link></section>
      <section className="admin-metrics"><article><UsersThree size={20} /><span>注册账户</span><strong>{overview?.registeredUsers ?? "--"}</strong></article><article><MagnifyingGlass size={20} /><span>城市搜索</span><strong>{overview?.searches ?? "--"}</strong></article><article><ChartBar size={20} /><span>决策生成</span><strong>{overview?.decisions ?? "--"}</strong></article></section>
      {loading ? <div className="history-empty"><span className="button-loader dark" />正在载入运营数据</div> : <div className="admin-grid"><section className="admin-table-card"><div><span className="section-kicker">注册数据</span><h2>用户账户</h2></div><div className="admin-table"><div className="admin-row is-head"><span>用户</span><span>角色</span><span>注册时间</span></div>{users.map((item) => <div className="admin-row" key={item.id}><span><strong>{item.displayName}</strong><small>@{item.username}</small></span><span className={`role-chip role-${item.role.toLowerCase()}`}>{item.role === "ADMIN" ? "管理员" : "用户"}</span><time>{format(item.createdAt)}</time></div>)}</div></section>
      <section className="admin-table-card"><div><span className="section-kicker">搜索数据</span><h2>最近 100 次城市检索</h2></div><div className="admin-table"><div className="admin-row search-row is-head"><span>关键词</span><span>身份</span><span>结果 / 时间</span></div>{searches.length === 0 ? <p className="admin-empty">暂无搜索记录</p> : searches.map((item) => <div className="admin-row search-row" key={item.id}><span><strong>{item.query}</strong><small>{item.username || "未登录"}</small></span><span className="role-chip">{item.actorType === "REGISTERED" ? "注册用户" : item.actorType === "GUEST" ? "访客" : "匿名"}</span><time>{item.resultCount} 条 · {format(item.createdAt)}</time></div>)}</div></section></div>}
    </div></main>;
}
