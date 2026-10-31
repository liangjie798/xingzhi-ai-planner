"use client";

import { ArrowDown, ArrowRight, ArrowUpRight, CalendarBlank, Check, Compass, List, MapPin, MapTrifold, Quotes, X } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import s from "./welcome.module.css";

const questions = [
  ["第一次使用，需要注册吗？", "可以先在登录页选择访客体验。想把规划留在自己的账户里，再注册或登录。"],
  ["还没有想好完整行程，能开始吗？", "可以。先说目的地或活动想法，日期、人数和偏好会在对话中逐步确认，也可以随时修改。"],
  ["天气数据和 AI 回答有什么区别？", "天气与空气质量使用数据服务；AI 负责理解需求和组织建议。资料来源与无法核实的内容会在回答中说明。"],
  ["可以查询机票和火车票吗？", "机票工具可读取部分已接入航司的官网展示价，不能保证覆盖所有航线或最终含税价。火车票目前提供12306查询入口。"],
  ["生成的规划可以带走吗？", "旅行和活动方案支持下载 Word、Markdown，也可以通过浏览器打印或保存为 PDF。"],
  ["出发前，还需要核对什么？", "请再次核对天气预警、景点开放与预约、交通余票和现场条件。AI 规划是建议，不替代官方通知和现场判断。"],
];

export default function WelcomePage() {
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { localStorage.setItem("shihou:onboarded", "1"); } catch {}
    const elements = root.current?.querySelectorAll<HTMLElement>("[data-reveal], [data-word]");
    if (!elements || !window.IntersectionObserver || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.setAttribute("data-visible", "true"); observer.unobserve(entry.target); }
    }, { threshold: 0.12 });
    elements.forEach(element => { element.setAttribute("data-animate", "true"); observer.observe(element); });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
      if (event.key === "Tab") {
        const nodes = root.current?.querySelectorAll<HTMLElement>('[data-menu] a, [data-menu] button');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    root.current?.querySelector<HTMLElement>('[data-menu] button')?.focus();
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", key); };
  }, [open]);
  return <div ref={root} className={s.page}>
    <a className={s.skip} href="#welcome-content">跳到主要内容</a>
    <header className={s.header}>
      <Link href="/welcome" className={s.brand} aria-current="page"><Compass size={32} weight="duotone" /><span>行知<small>让每次出发，都有准备</small></span></Link>
      <nav className={s.desktopNav} aria-label="介绍页导航"><a href="#how-it-works">如何使用</a><a href="#questions">常见问题</a><Link href="/login">进入行知 <ArrowUpRight size={16} /></Link></nav>
      <button ref={toggle} className={s.menuButton} aria-label="打开导航" aria-expanded={open} aria-controls="welcome-menu" onClick={() => setOpen(true)}><List size={24} /></button>
    </header>
    {open && <div id="welcome-menu" className={s.mobileMenu} role="dialog" aria-modal="true" aria-label="介绍页导航" data-menu><button className={s.menuClose} aria-label="关闭导航" onClick={() => { setOpen(false); toggle.current?.focus(); }}><X size={24} /></button><span className={s.eyebrow}>行知 · 从这里开始</span><nav><a href="#how-it-works" onClick={() => setOpen(false)}>如何使用 <ArrowUpRight /></a><a href="#questions" onClick={() => setOpen(false)}>常见问题 <ArrowUpRight /></a><Link href="/login">开始我的规划 <ArrowUpRight /></Link></nav></div>}
    <main id="welcome-content" tabIndex={-1}>
      <section className={s.hero} aria-labelledby="hero-title">
        <div className={s.heroCopy}><span className={s.eyebrow}><span /> AI 活动与旅行规划</span><h1 id="hero-title">心里有个远方，<br />出发有份计划。</h1><p>把想去的地方、想做的事告诉行知。<br className={s.desktopBreak} />一起看天气、排日程，把一句想法变成可执行的安排。</p><Link className={s.primary} href="/login">开始我的规划 <ArrowRight size={20} /></Link><small className={s.reassurance}><Check size={16} />可先以访客体验，无需注册</small><div className={s.heroFoot}><span>旅行出游</span><span>校园活动</span><span>社区户外</span><a href="#how-it-works" aria-label="向下查看使用方式"><ArrowDown size={20} /></a></div></div>
        <div className={s.heroVisual}><figure className={s.landscape}><Image src="/images/xingzhi-landscape.webp" alt="云雾笼罩的绿色山谷与蜿蜒河流" fill priority sizes="(max-width: 800px) 100vw, 50vw" /><figcaption><MapPin size={16} />下一站，留给你的想象。</figcaption></figure><article className={s.preview} aria-label="行程结构示例，并非实时推荐"><div className={s.previewTop}><span><MapTrifold size={20} />周末，去杭州走走</span><small>规划示例</small></div><h2>把风景，排进日程。</h2><p>西湖周边 · 轻松步行 · 一日安排</p><ol>{[["09:00","沿湖散步","留出休息和拍照的时间"],["12:00","午餐与休息","把用餐也算进行程"],["14:00","按天气调整下一站","下雨时，换个室内目的地"]].map(([time,title,copy]) => <li key={time}><time>{time}</time><span><strong>{title}</strong><small>{copy}</small></span><span className={s.routeDot} /></li>)}</ol><footer><CalendarBlank size={16} /><span>实际安排会结合你的日期与偏好</span></footer></article><div className={s.visualIndex} aria-hidden="true"><span>行有所向</span><span>知而后行</span></div></div>
      </section>
      <section className={s.benefits} aria-label="规划能帮你做什么" data-reveal><div><span className={s.eyebrow}>从准备，到出发</span><h2>少一点临时决定，<br />多一点心中有数。</h2></div><div className={s.benefitRows}>{[["把天气，放进安排里。","对照逐小时天气与空气质量，为户外活动挑时段，也为行程留备选。"],["想法变了，计划跟着改。","换日期、调人数、放慢节奏，直接在当前对话里说，条件逐步确认。"],["一份规划，带着就能走。","地点、日程、执行事项放在一起，支持 Word、Markdown 和打印留存。"]].map(([title,copy],i) => <article key={title}><span>0{i+1}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}</div></section>
      <section className={s.method} id="how-it-works" aria-labelledby="method-title" data-reveal><figure><Image src="/images/xingzhi-field-notes.webp" alt="地图、指南针和绿色笔记本组成的行前准备桌面" fill sizes="(max-width: 800px) 100vw, 42vw" /><figcaption>好的出发，从认真准备开始。</figcaption></figure><div><span className={s.eyebrow}>你来提想法，行知来一起梳理</span><h2 id="method-title">像聊天一样，<br />完成行前准备。</h2><ol>{[["先说一个想法","“周末想去杭州，走得轻松一点。”从目的地开始，不必一次说完所有条件。"],["一起把细节确认好","日期、同行人、活动偏好逐步补充。结合天气和地点资料，看看怎样安排更合适。"],["拿到可以带走的规划","查看按天的旅行日程或按时段的活动任务，继续调整，或下载保存。"]].map(([title,copy],i) => <li key={title}><span>0{i+1}</span><div><h3>{title}</h3><p>{copy}</p></div></li>)}</ol><Link className={s.textLink} href="/login">试着聊聊我的计划 <ArrowRight size={20} /></Link></div></section>
      <section className={s.tagline} aria-label="行知的规划理念"><Quotes size={32} weight="fill" aria-hidden="true" /><p>{["把时间留给风景，","把准备交给行知。"].map(line => <span className={s.taglineLine} key={line}>{Array.from(line).map((word,i) => <span data-word key={i}>{word}</span>)}</span>)}</p><span className={s.eyebrow}>你的偏好，是每份规划的起点。</span></section>
      <section className={s.faq} id="questions" aria-labelledby="faq-title" data-reveal><header><span className={s.eyebrow}>出发前，你可能想问</span><h2 id="faq-title">先了解，<br />再开始。</h2><Link className={s.textLink} href="/hourly">先看看逐小时数据 <ArrowUpRight size={18} /></Link></header><div>{questions.map(([q,a]) => <article key={q}><h3>{q}</h3><p>{a}</p></article>)}</div></section>
      <section className={s.finalCta} data-reveal><div><span className={s.eyebrow}>下一次出发，从这里开始</span><h2>你想去哪里？</h2><p>一个城市、一场活动，或者一个还没想好的周末。</p></div><Link className={s.primary} href="/login">开始我的规划 <ArrowRight size={20} /></Link></section>
    </main>
    <footer className={s.footer}><Link className={s.brand} href="/welcome"><Compass size={28} weight="duotone" /><span>行知<small>AI 活动与旅行规划</small></span></Link><p>规划是建议，出发前请复核天气预警、开放预约与现场条件。</p><nav aria-label="页脚导航"><Link href="/privacy">隐私与数据</Link><Link href="/terms">使用说明</Link><a href="https://github.com/liangjie798/xingzhi-ai-planner" target="_blank" rel="noreferrer">项目源码 <ArrowUpRight size={14} /></a></nav><small>行有所向 · 知而后行</small></footer>
  </div>;
}
