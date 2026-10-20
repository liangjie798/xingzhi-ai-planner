"use client";

import { ArrowRight, CheckCircle, Compass, IdentificationCard, LockKey, ShieldCheck, User, UserCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { currentUser, login, loginAsGuest, register } from "@/lib/auth";

type Portal = "USER" | "GUEST" | "ADMIN";

export default function LoginPage() {
  const router = useRouter();
  const [portal, setPortal] = useState<Portal>("USER"); const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { void currentUser().then((user) => { if (user?.role === "ADMIN") router.replace("/admin"); else if (user?.role === "USER") router.replace("/account"); }); }, [router]);
  function choose(next: Portal) { setPortal(next); setIsRegistering(false); setError(""); setBusy(false); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (portal === "GUEST") { await loginAsGuest(); router.replace("/dashboard"); return; }
      const user = isRegistering ? await register(username.trim(), password, displayName.trim()) : await login(username.trim(), password, portal);
      router.replace(user.role === "ADMIN" ? "/admin" : "/account");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "登录失败"); setBusy(false); }
  }
  const title = portal === "ADMIN" ? "管理员入口" : portal === "GUEST" ? "访客体验" : isRegistering ? "创建用户账户" : "用户登录";
  return <main className="auth-page">
    <section className="auth-story"><Link href="/welcome" className="auth-brand"><span><Compass size={22} weight="duotone" /></span>适候</Link><div className="auth-story-copy"><span className="section-kicker">可信环境决策</span><h1>每一种身份，<br />都有清晰的数据边界。</h1><p>用户保留自己的决策记录，访客轻量体验，管理员查看注册、搜索与使用统计。</p></div><div className="auth-proof"><CheckCircle size={18} weight="fill" /><span>服务端会话 · BCrypt 密码保护 · 角色权限隔离</span></div></section>
    <section className="auth-form-wrap"><form className="auth-card" onSubmit={submit}>
      <div className="portal-tabs" role="tablist"><button type="button" className={portal === "USER" ? "is-active" : ""} onClick={() => choose("USER")}><UserCircle size={16} />用户</button><button type="button" className={portal === "GUEST" ? "is-active" : ""} onClick={() => choose("GUEST")}><IdentificationCard size={16} />访客</button><button type="button" className={portal === "ADMIN" ? "is-active" : ""} onClick={() => choose("ADMIN")}><ShieldCheck size={16} />管理员</button></div>
      <span className="section-kicker">{portal === "ADMIN" ? "运营与数据管理" : portal === "GUEST" ? "免注册体验" : "个人决策空间"}</span><h2>{title}</h2><p>{portal === "ADMIN" ? "查看注册用户、城市搜索与决策使用情况。" : portal === "GUEST" ? "不保存个人决策档案，退出会话后身份失效。" : "登录后自动保存由你生成的活动决策。"}</p>
      {portal !== "GUEST" && <>{isRegistering && <><label htmlFor="displayName">显示名称</label><div className="auth-input"><IdentificationCard size={18} /><input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={30} required /></div></>}<label htmlFor="username">用户名</label><div className="auth-input"><User size={18} /><input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} pattern="[A-Za-z0-9_]{3,24}" required /></div><label htmlFor="password">密码</label><div className="auth-input"><LockKey size={18} /><input id="password" type="password" autoComplete={isRegistering ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></div></>}
      {error && <div className="auth-error" role="alert">{error}</div>}<button className="auth-submit" disabled={busy}>{busy ? <span className="button-loader" /> : <>{portal === "GUEST" ? "建立访客会话" : isRegistering ? "注册并进入账户" : "登录"}<ArrowRight size={18} /></>}</button>
      {portal === "USER" && <button className="auth-switch" type="button" onClick={() => { setIsRegistering((value) => !value); setError(""); }}>{isRegistering ? "已有账户？返回登录" : "没有账户？注册新用户"}</button>}<Link className="auth-guest" href="/welcome">查看平台介绍</Link>
    </form></section>
  </main>;
}
