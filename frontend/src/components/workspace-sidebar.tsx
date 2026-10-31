"use client";

import { Archive, Bookmarks, ChatCircleDots, ClipboardText, Compass, List, MapTrifold, Plus, Trash, UsersThree, X } from "@phosphor-icons/react";
import { Dialog } from "@radix-ui/themes";
import Link from "next/link";
import { useState } from "react";
import { SlidingSelection } from "./switch-motion";

type View = "studio" | "map" | "plan" | "execution" | "library" | "archive";
const views = [
  { id: "studio", label: "分析台", icon: ChatCircleDots },
  { id: "map", label: "环境地图", icon: MapTrifold },
  { id: "plan", label: "执行方案", icon: ClipboardText },
  { id: "execution", label: "执行管理", icon: UsersThree },
  { id: "library", label: "资料收藏", icon: Bookmarks },
  { id: "archive", label: "活动档案", icon: Archive },
] as const;

export function WorkspaceSidebar({ view, sessions, sessionId, disabled, onView, onOpen, onDelete }: {
  view: View;
  sessions: { id: string; title: string; updatedAt: string }[];
  sessionId: string;
  disabled: boolean;
  onView: (view: View) => void;
  onOpen: (id?: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  // The same navigation serves desktop and the accessible mobile dialog.
  function contents(mobile = false) {
    return <>
      <Link href="/welcome" className="workspace-brand"><span><Compass size={25} weight="duotone" /></span><div><strong>行知</strong><small>AI 活动与旅行规划</small></div></Link>
      <button className="new-conversation" disabled={disabled} onClick={() => { onOpen(); setOpen(false); }}><Plus size={18} />新建对话</button>
      <nav className="workspace-navigation" aria-label="工作区导航"><SlidingSelection value={view} />{views.map(item => <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined} className={view === item.id ? "is-active" : ""} onClick={() => { onView(item.id); setOpen(false); }}><item.icon size={20} weight={view === item.id ? "duotone" : "regular"} />{item.label}</button>)}</nav>
      <Link href="/transport" className="transport-nav-link"><MapTrifold size={20}/>交通比价 <span>飞机 / 火车 ↗</span></Link>
      <div className="session-list-heading"><span>历史对话</span><small>{sessions.length}</small></div>
      <div className="session-history" aria-label="历史对话">{sessions.map(item => <button key={item.id} type="button" disabled={disabled} aria-current={sessionId === item.id ? "true" : undefined} onClick={() => { onOpen(item.id); setOpen(false); }}><ChatCircleDots size={16} /><span>{item.title || "新对话"}<time>{new Date(item.updatedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric" })}</time></span></button>)}{!sessions.length && <p>新的想法，从一次对话开始。</p>}</div>
      <div className="sidebar-bottom"><button type="button" disabled={disabled} onClick={() => { onDelete(); if (mobile) setOpen(false); }}><Trash size={16} />删除此对话</button><Link href="/welcome">了解行知 <span aria-hidden="true">↗</span></Link><small>每条对话独立保存条件与方案</small></div>
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
