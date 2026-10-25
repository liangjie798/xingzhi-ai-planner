"use client";

import { ArrowRight, CheckCircle, Compass, IdentificationCard, LockKey, User, UserCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { currentUser, login, loginAsGuest, register } from "@/lib/auth";

import { LoginPanel, SlidingSelection } from "@/components/switch-motion";

type Portal = "USER" | "GUEST";

export default function LoginPage() {
  const router = useRouter();
  const [portal, setPortal] = useState<Portal>("USER"); const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { void currentUser().then((user) => { if (user && ["ADMIN", "SUPER_ADMIN"].includes(user.role)) router.replace("/admin"); else if (user?.role === "USER") router.replace("/XingZhi"); }).catch(() => undefined); }, [router]);
  function choose(next: Portal) { if (busy) return; setPortal(next); setIsRegistering(false); setError(""); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (portal === "GUEST") { await loginAsGuest(); router.replace("/XingZhi"); return; }
      if (isRegistering) await register(username.trim(), password, displayName.trim());
      else await login(username.trim(), password, portal);
      router.replace("/XingZhi");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "登录失败"); setBusy(false); }
  }
  const title = portal === "GUEST" ? "访客体验" : isRegistering ? "创建用户账户" : "用户登录";
  return <main className="auth-page">
    <section className="auth-story"><Link href="/welcome" className="auth-brand"><span><Compass size={22} weight="duotone" /></span>行知</Link><div className="auth-story-copy"><span className="section-kicker">从想法到出发</span><h1>从一次对话，<br />开始一份好计划。</h1><p>登录后保留自己的规划记录，也可以先以访客身份体验，再决定下一次去哪里。</p></div><div className="auth-proof"><CheckCircle size={18} weight="fill" /><span>你的规划记录，留在自己的账户里。</span></div></section>
    <section className="auth-form-wrap"><form className="auth-card" onSubmit={submit}>
      <div className="portal-tabs portal-tabs-public" role="group" aria-label="登录身份"><SlidingSelection value={portal} /><button type="button" className={portal === "USER" ? "is-active" : ""} disabled={busy} onClick={() => choose("USER")}><UserCircle size={16} />用户</button><button type="button" className={portal === "GUEST" ? "is-active" : ""} disabled={busy} onClick={() => choose("GUEST")}><IdentificationCard size={16} />访客</button></div>
      <LoginPanel value={`${portal}-${isRegistering}-${error}`}><span className="section-kicker">{portal === "GUEST" ? "免注册体验" : "个人决策空间"}</span><h2>{title}</h2><p>{portal === "GUEST" ? "不保存个人决策档案，退出会话后身份失效。" : "登录后自动保存由你生成的活动决策。"}</p>
      {portal !== "GUEST" && <>{isRegistering && <><label htmlFor="displayName">显示名称</label><div className="auth-input"><IdentificationCard size={18} /><input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={30} required /></div></>}<label htmlFor="username">用户名</label><div className="auth-input"><User size={18} /><input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} pattern="[A-Za-z0-9_]{3,24}" required /></div><label htmlFor="password">密码</label><div className="auth-input"><LockKey size={18} /><input id="password" type="password" autoComplete={isRegistering ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></div></>}
      {error && <div className="auth-error" role="alert">{error}</div>}<button className="auth-submit" disabled={busy}>{busy ? <span className="button-loader" /> : <>{portal === "GUEST" ? "建立访客会话" : isRegistering ? "注册并进入账户" : "登录"}<ArrowRight size={18} /></>}</button>
      {portal === "USER" && <button className="auth-switch" type="button" disabled={busy} onClick={() => { setIsRegistering((value) => !value); setError(""); }}>{isRegistering ? "已有账户？返回登录" : "没有账户？注册新用户"}</button>}<Link className="auth-guest" href="/welcome">查看平台介绍</Link></LoginPanel>
    </form></section>
  </main>;
}
