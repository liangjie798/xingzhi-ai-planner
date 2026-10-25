"use client";

import { useState } from "react";
import { authenticatedRequest, type UserFeedback } from "@/lib/auth";

export function UserFeedbackPanel() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(""); const [content, setContent] = useState("");
  const [items, setItems] = useState<UserFeedback[]>([]); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const refresh = async () => setItems(await authenticatedRequest<UserFeedback[]>("/api/v1/feedback"));
  async function submit() {
    setBusy(true); setNotice("");
    try {
      const saved = await authenticatedRequest<{ id: number }>("/api/v1/feedback", "POST", { title, content });
      setNotice(`反馈 #${saved.id} 已送达管理平台，可在下方查看处理结果。`); setTitle(""); setContent(""); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "提交失败"); }
    finally { setBusy(false); }
  }
  return <section className="feedback-panel"><button type="button" className="secondary-button" onClick={() => { setOpen(!open); if (!open) void refresh().catch(() => setNotice("反馈记录暂时无法加载")); }}>问题反馈与处理进度 {open ? "−" : "+"}</button>{open && <div className="feedback-content"><p>反馈会送达管理员。仅提交你填写的内容，不会自动附带完整对话。</p><form onSubmit={event => { event.preventDefault(); void submit(); }}><label>问题标题<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：修改人数后没有更新方案" /></label><label>问题描述<textarea required maxLength={4000} value={content} onChange={event => setContent(event.target.value)} rows={4} placeholder="请描述操作步骤、预期结果和实际结果" /></label><button disabled={busy} type="submit">{busy ? "正在提交…" : "提交反馈"}</button></form>{notice && <p role="status">{notice}</p>}<div className="feedback-history">{items.map(item => <article key={item.id}><strong>#{item.id} {item.title}</strong><span>{({ OPEN: "待处理", IN_PROGRESS: "处理中", RESOLVED: "已处理" })[item.status]}</span><p>{item.content}</p>{item.adminReply && <p className="feedback-reply">管理员回复：{item.adminReply}</p>}</article>)}</div></div>}</section>;
}
