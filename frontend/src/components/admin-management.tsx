"use client";
import { useEffect, useState } from "react";
import { authenticatedRequest, type AdminUser, type UserFeedback } from "@/lib/auth";

const statusNames = { OPEN: "待处理", IN_PROGRESS: "处理中", RESOLVED: "已处理" };
export function AdminManagement() {
  const [tab, setTab] = useState<"users" | "feedback">("users");
  const [users, setUsers] = useState<AdminUser[]>([]); const [feedback, setFeedback] = useState<UserFeedback[]>([]);
  const [query, setQuery] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const [username, setUsername] = useState(""); const [displayName, setDisplayName] = useState(""); const [password, setPassword] = useState(""); const [enabled, setEnabled] = useState(true);
  const [selected, setSelected] = useState<UserFeedback | null>(null); const [reply, setReply] = useState(""); const [status, setStatus] = useState<UserFeedback["status"]>("OPEN");
  async function refresh() {
    const [nextUsers, nextFeedback] = await Promise.all([authenticatedRequest<AdminUser[]>("/api/v1/admin/users"), authenticatedRequest<UserFeedback[]>("/api/v1/admin/feedback")]);
    setUsers(nextUsers); setFeedback(nextFeedback);
  }
  useEffect(() => { void Promise.all([authenticatedRequest<AdminUser[]>("/api/v1/admin/users"), authenticatedRequest<UserFeedback[]>("/api/v1/admin/feedback")]).then(([nextUsers, nextFeedback]) => { setUsers(nextUsers); setFeedback(nextFeedback); }).catch(error => setNotice(error.message)); }, []);
  async function perform(action: () => Promise<unknown>, message: string) {
    setBusy(true); setNotice("");
    try { await action(); await refresh(); setNotice(message); }
    catch (error) { setNotice(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(false); }
  }
  function edit(user: AdminUser | "new") {
    setEditing(user); setUsername(user === "new" ? "" : user.username); setDisplayName(user === "new" ? "" : user.displayName); setPassword(""); setEnabled(user === "new" ? true : user.enabled);
  }
  return <section className="admin-management"><nav aria-label="管理功能"><button className={tab === "users" ? "is-active" : ""} onClick={() => setTab("users")}>用户管理 · {users.length}</button><button className={tab === "feedback" ? "is-active" : ""} onClick={() => setTab("feedback")}>用户反馈 · {feedback.filter(item => item.status !== "RESOLVED").length} 待处理</button><button disabled={busy} onClick={() => void perform(refresh, "数据已刷新")}>刷新</button></nav>{notice && <p role="status" className="admin-notice">{notice}</p>}<input className="admin-search" aria-label="搜索用户或反馈" placeholder={tab === "users" ? "搜索用户名、显示名" : "搜索反馈标题、内容、用户"} value={query} onChange={event => setQuery(event.target.value)} />
    {tab === "users" ? <><div className="admin-section-title"><h2>用户账户</h2><button disabled={busy} onClick={() => edit("new")}>新增用户</button></div>{editing && <form className="admin-editor" onSubmit={event => { event.preventDefault(); void perform(async () => {
      await authenticatedRequest(editing === "new" ? "/api/v1/admin/users" : `/api/v1/admin/users/${editing.id}`, editing === "new" ? "POST" : "PATCH", { ...(editing === "new" ? { username } : { enabled }), displayName, ...(password ? { password } : {}) }); setEditing(null); setPassword("");
    }, editing === "new" ? "用户已创建" : "用户资料已更新"); }}><h3>{editing === "new" ? "新增普通用户" : `编辑 @${editing.username}`}</h3>{editing === "new" && <label>用户名<input autoComplete="off" required pattern="[A-Za-z0-9_]{3,24}" value={username} onChange={event => setUsername(event.target.value)} /></label>}<label>显示名称<input required minLength={2} maxLength={30} value={displayName} onChange={event => setDisplayName(event.target.value)} /></label><label>{editing === "new" ? "初始密码" : "重置密码（留空不修改）"}<input type="password" autoComplete="new-password" required={editing === "new"} minLength={8} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} /></label>{editing !== "new" && <label><select aria-label="账户状态" value={enabled ? "enabled" : "disabled"} onChange={event => setEnabled(event.target.value === "enabled")}><option value="enabled">启用</option><option value="disabled">停用</option></select></label>}<div><button disabled={busy}>保存</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>取消</button></div></form>}<div className="admin-user-list">{users.filter(item => `${item.username} ${item.displayName}`.toLowerCase().includes(query.toLowerCase())).map(item => <article key={item.id}><div><strong>{item.displayName}</strong><span>@{item.username}</span><small>{item.role === "USER" ? (item.enabled ? "普通用户 · 已启用" : "普通用户 · 已停用") : "管理账户 · 受保护"}</small></div>{item.role === "USER" && <div><button disabled={busy} onClick={() => edit(item)}>编辑 / 重置密码</button><button disabled={busy} onClick={() => { if (window.confirm(`确认删除用户 @${item.username}？此操作无法撤销。`)) void perform(() => authenticatedRequest(`/api/v1/admin/users/${item.id}`, "DELETE"), "用户已删除"); }}>删除</button></div>}</article>)}</div></>
      : <><h2>反馈收件箱</h2><div className="admin-feedback-layout"><div>{feedback.filter(item => `${item.title} ${item.content} ${item.username}`.toLowerCase().includes(query.toLowerCase())).map(item => <button key={item.id} className={`admin-feedback-item ${selected?.id === item.id ? "is-selected" : ""}`} onClick={() => { setSelected(item); setReply(item.adminReply || ""); setStatus(item.status); }}><span>#{item.id} · {statusNames[item.status]}</span><strong>{item.title}</strong><small>{item.username.startsWith("anonymous-") ? "未登录访客" : item.username} · {new Date(item.createdAt).toLocaleString("zh-CN")}</small></button>)}{!feedback.length && <p>暂无用户反馈</p>}</div>{selected && <form className="admin-editor" onSubmit={event => { event.preventDefault(); void perform(async () => {
        const updated = await authenticatedRequest<UserFeedback>(`/api/v1/admin/feedback/${selected.id}`, "PATCH", { status, adminReply: reply }); setSelected(updated);
      }, "反馈处理结果已保存，提交者可查看回复"); }}><h3>{selected.title}</h3><p className="feedback-description">{selected.content}</p><label>处理状态<select value={status} onChange={event => setStatus(event.target.value as UserFeedback["status"])}>{Object.entries(statusNames).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label>回复用户<textarea rows={5} maxLength={2000} value={reply} onChange={event => setReply(event.target.value)} /></label><button disabled={busy}>保存处理结果</button><button type="button" disabled={busy} onClick={() => { if (window.confirm("确认永久删除这条反馈？")) void perform(async () => { await authenticatedRequest(`/api/v1/admin/feedback/${selected.id}`, "DELETE"); setSelected(null); }, "反馈已删除"); }}>删除反馈</button></form>}</div></>}
  </section>;
}
