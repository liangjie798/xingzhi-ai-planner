"use client";

import { AirplaneTilt, Archive, Bookmarks, ChatCircleDots, ClipboardText, Compass, List, MapTrifold, Plus, Trash, UsersThree, X } from "@phosphor-icons/react";
import { Dialog } from "@radix-ui/themes";
import Link from "next/link";
import { useState } from "react";
import { SlidingSelection } from "./switch-motion";

type View = import("@/lib/workspace-view").WorkspaceView;
const views = [
  { id: "studio", label: "分析台", icon: ChatCircleDots },
  { id: "map", label: "环境地图", icon: MapTrifold },
  { id: "plan", label: "执行方案", icon: ClipboardText },
  { id: "execution", label: "执行管理", icon: UsersThree },
  { id: "library", label: "资料收藏", icon: Bookmarks },
  { id: "archive", label: "活动档案", icon: Archive },
  { id: "transport", label: "交通比价", icon: AirplaneTilt },
] as const;

function historyDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric" });
}

export function WorkspaceSidebar({ view, sessions, sessionId, disabled, onView, onOpen, onDelete, onDeleteSelected }: {
  view: View;
  sessions: { id: string; title: string; updatedAt: string }[];
  sessionId: string;
  disabled: boolean;
  onView: (view: View) => void;
  onOpen: (id?: string) => void;
  onDelete: () => void;
  onDeleteSelected: (ids: string[]) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const allSelected = sessions.length > 0 && selected.length === sessions.length;
  const selectionDisabled = disabled || deleting;

  function toggleSelected(id: string) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }
  function exitSelection() {
    setSelecting(false);
    setSelected([]);
  }
  async function runBatchDelete(mobile = false) {
    if (!selected.length || deleting) return;
    setDeleting(true);
    try {
      const done = await onDeleteSelected(selected);
      if (done) {
        setSelected([]);
        setSelecting(false);
        if (mobile) setOpen(false);
      }
    } catch { /* 父组件负责在状态栏说明失败 */ }
    finally { setDeleting(false); }
  }

  // The same navigation serves desktop and the accessible mobile dialog.
  function contents(mobile = false) {
    const historyId = mobile ? "session-history-list-mobile" : "session-history-list";
    return <>
      <Link href="/welcome" className="workspace-brand"><span><Compass size={25} weight="duotone" /></span><div><strong>行知</strong><small>AI 活动与旅行规划</small></div></Link>
      <button className="new-conversation" disabled={disabled} onClick={() => { onOpen(); setOpen(false); }}><Plus size={18} />新建对话</button>
      <nav className="workspace-navigation" aria-label="工作区导航"><SlidingSelection value={view} />{views.map(item => <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined} className={view === item.id ? "is-active" : ""} onClick={() => { onView(item.id); setOpen(false); }}><item.icon size={20} weight={view === item.id ? "duotone" : "regular"} />{item.label}</button>)}</nav>
      <div className="session-list-heading">
        <span>历史对话</span>
        <span className="session-list-meta">
          <small>{sessions.length}</small>
          {sessions.length > 0 && <button type="button" className="session-batch-toggle" aria-expanded={selecting} aria-controls={historyId} disabled={disabled || deleting} onClick={() => { if (selecting) exitSelection(); else { setSelected([]); setSelecting(true); } }}>{selecting ? "退出批量" : "批量管理"}</button>}
        </span>
      </div>
      {selecting && <div className="session-selection-bar">
        <div><span aria-live="polite">已选 {selected.length} / {sessions.length}</span><button type="button" disabled={selectionDisabled} onClick={() => setSelected(allSelected ? [] : sessions.map(item => item.id))}>{allSelected ? "取消全选" : "全选"}</button></div>
        <div><button type="button" className="is-danger" disabled={!selected.length || selectionDisabled} onClick={() => void runBatchDelete(mobile)}>{deleting ? "正在删除…" : `删除选中${selected.length ? `（${selected.length}）` : ""}`}</button><button type="button" disabled={deleting} onClick={exitSelection}>退出</button></div>
      </div>}
      <div className="session-history" id={historyId} aria-label="历史对话">
        {sessions.map(item => selecting ? <label key={item.id} className={`session-choice ${selected.includes(item.id) ? "is-selected" : ""}`}>
          <input type="checkbox" checked={selected.includes(item.id)} disabled={selectionDisabled} onChange={() => toggleSelected(item.id)} />
          <span>{item.title || "新对话"}{item.id === sessionId && <em>当前</em>}<time>{historyDate(item.updatedAt)}</time></span>
        </label> : <button key={item.id} type="button" disabled={disabled} aria-current={sessionId === item.id ? "true" : undefined} onClick={() => { onOpen(item.id); setOpen(false); }}><ChatCircleDots size={16} /><span>{item.title || "新对话"}{item.id === sessionId && <em>当前</em>}<time>{historyDate(item.updatedAt)}</time></span></button>)}
        {!sessions.length && <p>新的想法，从一次对话开始。</p>}
      </div>
      <div className="sidebar-bottom"><button type="button" disabled={disabled || selecting} onClick={() => { onDelete(); if (mobile) setOpen(false); }}><Trash size={16} />删除当前对话</button><small>每条对话独立保存条件与方案</small></div>
    </>;
  }
  return <>
    <aside className="workspace-sidebar">{contents()}</aside>
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger><button className="mobile-navigation-button icon-button" type="button" aria-label="打开导航"><List size={23} /></button></Dialog.Trigger>
      <Dialog.Content className="mobile-navigation-dialog" maxWidth="340px" aria-describedby={undefined}>
        <Dialog.Title className="sr-only">行知工作区导航</Dialog.Title>
        <Dialog.Close><button className="mobile-navigation-close icon-button" aria-label="关闭导航"><X size={20} /></button></Dialog.Close>
        {contents(true)}
      </Dialog.Content>
    </Dialog.Root>
  </>;
}
