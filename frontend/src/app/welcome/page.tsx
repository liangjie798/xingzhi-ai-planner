"use client";

import { ArrowRight, CalendarBlank, ChatCircleDots, CheckCircle, Compass, DownloadSimple, MapTrifold, ShieldCheck } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect } from "react";

export default function WelcomePage() {
  useEffect(() => { try { localStorage.setItem("shihou:onboarded", "1"); } catch {} }, []);
  return <main className="welcome-editorial">
    <header className="intro-topbar"><Link href="/welcome" className="intro-brand"><Compass size={28} weight="duotone" /><span>行知<small>AI 活动与旅行规划</small></span></Link><nav><Link href="/hourly">逐小时数据</Link><Link href="/login">登录 / 访客体验 <ArrowRight size={16} /></Link></nav></header>
    <section className="intro-hero"><div><span className="section-kicker">从一句想法，到一份可执行的计划</span><h1>出发之前，<br />先把计划想清楚。</h1><p>想去旅行，或组织一场活动？和行知聊聊。我们先问清日期、目的地和同行情况，再结合天气与空气质量，把想法写成一份可以带走的规划。</p><div className="intro-actions"><Link href="/dashboard">开始对话规划 <ArrowRight size={18} /></Link><a href="#how-it-works">看看如何使用</a></div><span className="intro-caption">旅游、运动会、体育课、社区活动、户外训练与研学</span></div>
    <aside className="intro-preview" aria-label="对话规划流程示例"><div className="intro-preview-heading"><ChatCircleDots size={20} /><strong>一次对话，逐步完善</strong><span>使用示例</span></div><p className="intro-sample-user">帮我规划三天旅游路线。</p><p className="intro-sample-assistant">想去哪个城市？哪天出发？大约几个人同行？</p><p className="intro-sample-user">西安，明天出发，两个成年人。</p><div className="intro-preview-result"><CheckCircle size={20} /><div><strong>条件确认后，开始规划</strong><p>查询当地逐小时环境 → 编排景点与美食 → 生成图文规划书</p></div></div><div className="intro-preview-meta"><span><MapTrifold size={17} />行政区色带地图</span><span><DownloadSimple size={17} />Word / Markdown / 打印</span></div></aside></section>
    <section className="intro-workflow" id="how-it-works"><header><span className="section-kicker">怎样把想法落到纸上</span><h2>先问清，再分析，最后给出安排。</h2></header><div>{[
      [ChatCircleDots,"01","说出你的需求","不需要填写长表单。缺少目的地、日期或参与人群时，Agent 会继续询问，并记住已经确认的答案。"],
      [MapTrifold,"02","看地图与数据","查看行政区内的连续色带和逐小时环境；在数据与证据页面核对来源，在 Agent 轨迹中了解工具执行情况。"],
      [CalendarBlank,"03","拿到详细规划","旅游方案按天展示地点图片、推荐理由和行程顺序；其他活动给出分时段任务、负责岗位和备用安排。"],
    ].map(([Icon,index,title,copy])=>{const Graphic=Icon as typeof Compass;return <article key={String(index)}><span>{String(index)}</span><Graphic size={24} weight="duotone"/><h3>{String(title)}</h3><p>{String(copy)}</p></article>;})}</div></section>
    <section className="intro-deliverables"><div><span className="section-kicker">一份方案，多种使用方式</span><h2>旅行时能看，<br />组织活动时能照着做。</h2></div><div><p><strong>旅行规划书</strong>按天编排行程，区分游览与餐饮，提供可用地点资料图片、到访建议与官方资料入口。照片缺失时会明确标注。</p><p><strong>活动执行书</strong>从场地复核、签到分组到正式活动、补水休息和清场，逐项列出建议时间与负责岗位；多日活动按天展开。</p><p><strong>下载与留存</strong>支持 Word、Markdown，以及浏览器打印或存为 PDF。登录后可保存个人决策记录，访客也可以开始体验。</p></div></section>
    <footer className="intro-footer"><div><ShieldCheck size={20}/><p>天气与空气数据来自 Open-Meteo，地点资料来自公开 POI 与文旅来源。规划属于建议安排，出发前请复核天气预警、开放预约与现场条件。</p></div><Link href="/dashboard">现在开始一份规划 <ArrowRight size={17}/></Link><small>行知 · AI 活动与旅行规划</small></footer>
  </main>;
}
