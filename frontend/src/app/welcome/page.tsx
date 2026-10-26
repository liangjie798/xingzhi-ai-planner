"use client";

import { ArrowRight, CalendarBlank, ChatCircleDots, Compass, MapTrifold, ShieldCheck } from "@phosphor-icons/react";
import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";

export default function WelcomePage() {
  useEffect(() => { try { localStorage.setItem("shihou:onboarded", "1"); } catch {} }, []);
  return <main className="welcome-editorial">
    <header className="intro-topbar"><Link href="/welcome" className="intro-brand"><Compass size={28} weight="duotone" /><span>行知<small>AI 活动与旅行规划</small></span></Link><nav><Link href="/hourly">逐小时数据</Link><Link href="/login">登录 / 访客体验 <ArrowRight size={16} /></Link></nav></header>
    <section className="intro-hero"><div><span className="section-kicker">从一句想法，到一份可执行的计划</span><h1>出发之前，<br />先把计划想清楚。</h1><p>想去旅行，或组织一场活动？和行知聊聊。我们先问清日期、目的地和同行情况，再结合天气与空气质量，把想法写成一份可以带走的规划。</p><div className="intro-actions"><Link href="/XingZhi">开始对话规划 <ArrowRight size={18} /></Link><a href="#how-it-works">看看如何使用</a></div><span className="intro-caption">旅游、运动会、体育课、社区活动、户外训练与研学</span></div>
    <figure className="intro-landscape"><Image src="/images/xingzhi-landscape.webp" alt="云雾间的绿色山谷与蜿蜒河流，行知品牌意境图" fill priority unoptimized sizes="(max-width: 800px) 100vw, 55vw" /><figcaption>把下一次出发，交给更周全的准备。</figcaption></figure></section>
    <section className="intro-method" id="how-it-works"><figure><Image src="/images/xingzhi-field-notes.webp" alt="地图、指南针与绿色笔记本，行前准备意境图" fill unoptimized sizes="(max-width: 800px) 100vw, 40vw" /></figure><div><header><span className="section-kicker">怎样把想法落到纸上</span><h2>聊清楚，<br />再安心出发。</h2></header>{[
      { icon: ChatCircleDots, title: "说出你的需求", copy: "不用填写长表单。目的地、日期与同行情况，在对话中逐步确认；修改条件，也可以直接说。" },
      { icon: MapTrifold, title: "看地图与数据", copy: "查看逐小时天气、地点与路线，核对资料来源，了解推荐依据和仍需确认的事项。" },
      { icon: CalendarBlank, title: "拿到详细规划", copy: "旅行按天安排地点与理由，活动按时段列出任务。方案支持 Word、Markdown 和打印。" },
    ].map(({icon: Icon,title,copy})=><article key={title}><Icon size={23} weight="duotone" /><div><h3>{title}</h3><p>{copy}</p></div></article>)}</div></section>
    <section className="intro-deliverables"><div><span className="section-kicker">一份方案，多种使用方式</span><h2>旅行时能看，<br />组织活动时能照着做。</h2></div><div><p><strong>旅行规划书</strong>按天编排行程，区分游览与餐饮，提供到访建议与官方资料入口。有可用地点照片时展示。</p><p><strong>活动执行书</strong>从场地复核、签到分组到正式活动、补水休息和清场，逐项列出建议时间与负责岗位；多日活动按天展开。</p><p><strong>下载与留存</strong>支持 Word、Markdown，以及浏览器打印或存为 PDF。登录后可保存个人决策记录，访客也可以开始体验。</p></div></section>
    <footer className="intro-footer"><div><ShieldCheck size={20}/><p>天气与空气数据来自 Open-Meteo，地点资料来自公开 POI 与文旅来源。规划属于建议安排，出发前请复核天气预警、开放预约与现场条件。</p></div><Link href="/XingZhi">开始对话规划 <ArrowRight size={17}/></Link><small>行知 · AI 活动与旅行规划</small></footer>
  </main>;
}
