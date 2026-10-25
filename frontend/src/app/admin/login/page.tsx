"use client";

import { ArrowLeft, ArrowRight, CheckCircle, Compass, LockKey, ShieldCheck, User } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { currentUser, login } from "@/lib/auth";
import { LoginPanel } from "@/components/switch-motion";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentUser().then((user) => {
      if (user && ["ADMIN", "SUPER_ADMIN"].includes(user.role)) router.replace("/admin");
    }).catch(() => undefined);
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      // The backend independently rejects ordinary accounts for the ADMIN portal.
      await login(username.trim(), password, "ADMIN");
      router.replace("/admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "管理员登录失败，请重试。");
      setBusy(false);
    }
  }

  return <main className="auth-page admin-auth-page">
    <section className="auth-story">
      <Link href="/welcome" className="auth-brand"><span><Compass size={22} weight="duotone" /></span>行知</Link>
      <div className="auth-story-copy"><span className="section-kicker">行知 · 运营管理</span><h1>看清平台动态，<br />做好每一次运营。</h1><p>集中查看注册用户、城市搜索与规划使用情况，为平台服务提供依据。</p></div>
      <div className="auth-proof"><CheckCircle size={18} weight="fill" /><span>独立管理入口 · 仅限授权账户</span></div>
    </section>
    <section className="auth-form-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="admin-login-badge"><ShieldCheck size={20} weight="duotone" /><span>管理中心 · 独立入口</span></div>
        <LoginPanel value={error}>
          <span className="section-kicker">运营与数据管理</span><h2>管理员登录</h2><p>请使用已授权的管理员或超级管理员账户。</p>
          <label htmlFor="admin-username">管理员账号</label><div className="auth-input"><User size={18} /><input id="admin-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={24} required disabled={busy} /></div>
          <label htmlFor="admin-password">密码</label><div className="auth-input"><LockKey size={18} /><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} /></div>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-submit" disabled={busy}>{busy ? <span className="button-loader" /> : <>登录管理中心<ArrowRight size={18} /></>}</button>
          <Link className="auth-guest" href="/login"><ArrowLeft size={12} /> 返回用户登录</Link>
        </LoginPanel>
      </form>
    </section>
  </main>;
}
