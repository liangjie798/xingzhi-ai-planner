"use client";

import {
  Archive,
  ArrowRight,
  ArrowUpRight,
  Bookmarks,
  CalendarBlank,
  ChatCircleDots,
  Check,
  ClipboardText,
  CloudSun,
  Compass,
  MapTrifold,
  SuitcaseRolling,
  UsersThree,
} from "@phosphor-icons/react";
import type { WorkspaceView } from "@/lib/workspace-view";
import s from "./workspace-experience.module.css";

const pages = {
  studio: {
    label: "分析台",
    title: "让下一次出发，有个好开始。",
    detail: "说说目的地、日期和想做的事。我们一起把想法整理成安排。",
    icon: ChatCircleDots,
  },
  map: {
    label: "环境地图",
    title: "先看看目的地的环境。",
    detail: "切换图层，了解天气、空气质量与活动适宜度。具体地点与日期可在对话中确认。",
    icon: MapTrifold,
  },
  plan: {
    label: "执行方案",
    title: "把想法，变成可以照着做的计划。",
    detail: "查看日程与任务，核对资料依据，也可以下载一份带走。",
    icon: ClipboardText,
  },
  execution: {
    label: "执行管理",
    title: "安排到位，现场有序。",
    detail: "把任务、场地、负责人和费用放在一起。分工仅作记录，不会自动发送通知。",
    icon: UsersThree,
  },
  library: {
    label: "资料收藏",
    title: "有用的资料，下次还能找到。",
    detail: "收藏官网、预约要求和组织笔记，记录核对状态。收藏内容不会自动成为 Agent 的知识。",
    icon: Bookmarks,
  },
  archive: {
    label: "活动档案",
    title: "留住每一份计划的来路。",
    detail: "保存方案版本，比较调整前后的差异，也给下一次安排留一点经验。",
    icon: Archive,
  },
};

export function WorkspaceHeading({
  view,
  onAction,
  actionLabel,
}: {
  view: WorkspaceView;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const page = pages[view],
    Icon = page.icon;
  return (
    <header className={s.pageHeading}>
      <div>
        <span className={s.eyebrow}>
          <Icon size={16} />
          行知工作区<span>/</span>
          {page.label}
        </span>
        <h1>{page.title}</h1>
        <p>{page.detail}</p>
      </div>
      {onAction && (
        <button className={s.headingAction} type="button" onClick={onAction}>
          {actionLabel || "回到分析台"}
          <ArrowUpRight size={18} />
        </button>
      )}
    </header>
  );
}

export function WorkspaceStarters({ onChoose, disabled }: { onChoose: (text: string) => void; disabled: boolean }) {
  return (
    <div className={s.starters}>
      <p>从一个小小的想法开始</p>
      <div>
        {[
          {
            icon: SuitcaseRolling,
            label: "安排一次旅行",
            detail: "目的地、节奏，按你的偏好来",
            prompt: "周末想去杭州玩两天，行程轻松一点。",
          },
          {
            icon: UsersThree,
            label: "组织一场活动",
            detail: "一起确认场地、人数和时段",
            prompt: "我想组织一场户外活动，请帮我逐步确认需求。",
          },
          { icon: CloudSun, label: "先看看天气", detail: "了解目的地，挑一个好时段", prompt: "明天杭州的天气怎么样？" },
        ].map(({ icon: Icon, label, detail, prompt }) => (
          <button key={label} type="button" disabled={disabled} onClick={() => onChoose(prompt)}>
            <Icon size={24} weight="duotone" />
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <ArrowUpRight size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function WorkspaceMetrics({ items }: { items: { label: string; value: string | number; detail?: string }[] }) {
  return (
    <dl className={s.metrics}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.detail && <small>{item.detail}</small>}
        </div>
      ))}
    </dl>
  );
}

export function WorkspaceEmpty({
  kind,
  title,
  description,
  action,
  onAction,
}: {
  kind: "plan" | "execution" | "library" | "archive";
  title: string;
  description: string;
  action: string;
  onAction: () => void;
}) {
  const Icon = { plan: MapTrifold, execution: UsersThree, library: Bookmarks, archive: Archive }[kind];
  return (
    <section className={s.empty} aria-label={title}>
      <div className={s.emptyArt} aria-hidden="true">
        <span>
          <Compass size={24} />
        </span>
        <Icon size={56} weight="duotone" />
        <span>
          <Check size={20} />
        </span>
      </div>
      <span className={s.eyebrow}>下一步，从这里开始</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button" className={s.emptyAction} onClick={onAction}>
        {action}
        <ArrowRight size={18} />
      </button>
      <div className={s.emptySteps}>
        <span>
          <ChatCircleDots size={16} />
          说清需求
        </span>
        <span>
          <CalendarBlank size={16} />
          确认安排
        </span>
        <span>
          <ClipboardText size={16} />
          留存方案
        </span>
      </div>
    </section>
  );
}
