"use client";

import { ArrowRight, CheckCircle, Compass, LockKey, User } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { currentUser, login } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void currentUser().then((user) => { if (user) router.replace("/account"); }); }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await login(username.trim(), password); router.replace("/account"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "登录失败"); setBusy(false); }
  }

  return <main className="auth-page">
    <section className="auth-story">
      <Link href="/" className="auth-brand"><span><Compass size={22} weight="duotone" /></span>适候</Link>
      <div className="auth-story-copy"><span className="section-kicker">个人决策空间</span><h1>把每一次环境判断，<br />变成可追溯的经验。</h1><p>登录后自动保存活动决策、依据与生成时间。访客仍可直接使用完整决策工作台。</p></div>
      <div className="auth-proof"><CheckCircle size={18} weight="fill" /><span>服务端会话 · BCrypt 密码保护 · 决策记录仅本人可见</span></div>
    </section>
    <section className="auth-form-wrap">
      <form className="auth-card" onSubmit={submit}>
        <span className="section-kicker">账户登录</span><h2>欢迎回来</h2><p>管理员可查看已登录账户产生的决策历史。</p>
        <label htmlFor="username">用户名</label><div className="auth-input"><User size={18} /><input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></div>
        <label htmlFor="password">密码</label><div className="auth-input"><LockKey size={18} /><input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" disabled={busy}>{busy ? <span className="button-loader" /> : <>登录并查看记录 <ArrowRight size={18} /></>}</button>
        <Link className="auth-guest" href="/dashboard">以访客身份继续使用</Link>
      </form>
    </section>
  </main>;
}
