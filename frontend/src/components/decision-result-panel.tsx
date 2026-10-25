"use client";

import { Binoculars, Brain, CalendarCheck, CheckCircle, ClipboardText, Database, Info, MapPin, Pulse, ShieldCheck, Sparkle, UsersThree, ArrowUpRight, Clock } from "@phosphor-icons/react";
import Image from "next/image";
import { useState } from "react";
import { SlidingSelection, useSwitchEntrance } from "./switch-motion";
import { cityById } from "@/lib/cities";
import { AgentProgress } from "./agent-progress";
import { formatDuration } from "@/lib/timing";
import { buildPlanningDocument, documentMarkdown, downloadBlob, downloadWord, type PlanningDocument } from "@/lib/planning-document";
import type { ActivityInput, DecisionResult, EvidenceItem, ToolTraceItem, TourismRoute } from "@/lib/types";

type Panel = "plan" | "evidence" | "trace";
const toolLabels: Record<string, string> = {
  agent_plan: "制定分析计划", get_environment_window: "读取逐小时环境",
  score_activity_slots: "计算活动时段评分", retrieve_policy_evidence: "检索政策与安全依据",
  compare_activity_plans: "比较候选活动方案", build_contingency_plan: "制定备用预案",
  synthesize_grounded_decision: "整合有依据的决策", verify_final_decision: "校验最终决策",
};
const toolLabel = (name: string) => toolLabels[name] ?? name;
interface Props {
  input: ActivityInput; isTourism: boolean; route: TourismRoute | null; result: DecisionResult | null;
  liveTrace: ToolTraceItem[]; activePanel: Panel; onPanel: (panel: Panel) => void;
  isPlanning: boolean; isAnalyzing: boolean;
}

function SectionHeading({ number, title, detail }: { number: string; title: string; detail?: string }) {
  return <header className="report-section-heading"><span>{number}</span><div><h3>{title}</h3>{detail && <p>{detail}</p>}</div></header>;
}

function TraceVisualizer({ items, running, totalDurationMs }: { items: ToolTraceItem[]; running: boolean; totalDurationMs?: number }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? items.at(-1);
  const elapsed = items.reduce((sum, item) => sum + item.durationMs, 0);
  const fallbackCount = items.filter((item) => item.status === "fallback").length;
  return <div className="trace-report">
    <AgentProgress items={items} running={running} />
    <div className="report-stats">
      <div><span>整轮耗时</span><strong className="duration-value"><Pulse size={18} />{running ? "执行中" : formatDuration(totalDurationMs)}</strong></div>
      <div><span>工具步骤</span><strong>{items.length}<small>步</small></strong></div>
      <div><span>已记录工具耗时合计</span><strong className="duration-value">{formatDuration(elapsed)}</strong></div>
      <div><span>规则兜底</span><strong>{fallbackCount}<small>步</small></strong></div>
    </div>
    <p className="timing-explanation">整轮耗时包含本轮请求、数据查询和等待；工具步骤可能并行，累计耗时可大于整轮耗时。快速计算以毫秒显示；模型是否成功以步骤结果和具体说明为准。</p>
    {items.length ? <div className="trace-layout">
      <section><SectionHeading number="01" title="工具执行流程" detail="点击步骤，查看真实调用结果与耗时" />
        <ol className="trace-step-list">{items.map((item, index) => <li key={item.id}>
          <button type="button" className={selected?.id === item.id ? "is-selected" : ""} onClick={() => setSelectedId(item.id)} aria-pressed={selected?.id === item.id}>
            <span className={item.status === "fallback" ? "step-index is-fallback" : "step-index"}>{index + 1}</span>
            <span className="step-label"><strong>{toolLabel(item.name)}</strong><small>{item.status === "fallback" ? "规则兜底" : "已完成"} · {formatDuration(item.durationMs)}</small></span><ArrowUpRight size={17} />
          </button>
        </li>)}</ol>
      </section>
      {selected && <section className="trace-detail" aria-live="polite">
        <span className="section-kicker">步骤 {items.findIndex((item) => item.id === selected.id) + 1} / {items.length}</span>
        <Brain size={32} weight="duotone" /><h3>{toolLabel(selected.name)}</h3>
        <span className={selected.status === "fallback" ? "report-badge is-warning" : "report-badge"}>{selected.status === "fallback" ? "使用规则完成" : "工具执行完成"}</span>
        <p>{selected.detail}</p><dl><div><dt>工具耗时</dt><dd>{formatDuration(selected.durationMs)}</dd></div><div><dt>记录来源</dt><dd>实际工具调用</dd></div></dl>
        <div className="report-note"><Info size={18} /><p>这里展示工具执行记录与输出摘要，便于核对 Agent 实际完成的工作。</p></div>
      </section>}
    </div> : <div className="report-note"><Clock size={18} /><p>{running ? "正在准备首个工具，执行记录将自动更新。" : "本次分析暂无工具执行记录。"}</p></div>}
  </div>;
}

function PlanPhoto({ url, name }: { url?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;
  return <figure className="plan-photo"><Image src={`/plan-media?url=${encodeURIComponent(url)}`} alt={`${name}地点资料图片`} width={760} height={480} unoptimized onError={() => setFailed(true)} /><figcaption>{name} · 地点资料图片，实际环境以现场为准</figcaption></figure>;
}

function PlanDocumentReader({ document }: { document: PlanningDocument }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  return <div className="document-reader">
    <div className="document-toolbar"><span><ClipboardText size={17} />完整规划书</span><div>
      <button type="button" disabled={exporting} onClick={async () => { setExporting(true); setExportError(""); try { await downloadWord(document); } catch { setExportError("Word 下载失败，请重试或下载 Markdown。"); } finally { setExporting(false); } }}>{exporting ? "正在导出…" : "下载 Word"}</button>
      <button type="button" onClick={() => downloadBlob(new Blob([documentMarkdown(document)], { type: "text/markdown;charset=utf-8" }), `${document.title}.md`)}>下载 Markdown</button>
      <button type="button" onClick={() => window.print()}>打印 / 存为 PDF</button>
    </div></div>
    {exportError && <p role="alert">{exportError}</p>}
    <div className="document-layout"><nav className="document-toc" aria-label="规划书目录"><span>文档目录</span>{document.sections.map((section, index) => <a href={`#plan-chapter-${index}`} key={section.title}>{section.title}</a>)}</nav>
      <article className="planning-manuscript"><header><span>行知 / 活动与出行规划</span><h2>{document.title}</h2><p>{document.subtitle}</p></header>{document.sections.map((section, index) => <section id={`plan-chapter-${index}`} key={section.title}><h3>{section.title}</h3>{section.paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}{section.venues && <div className="activity-venue-list">{section.venues.map(venue => <article key={venue.id}><h4>{venue.name}</h4><p className="venue-address">{venue.address}</p><p><strong>推荐理由：</strong>{venue.reason}</p><p><strong>活动任务：</strong>{venue.task}</p><p className="venue-checks">{venue.checks}</p></article>)}</div>}{section.references && <ul className="compact-references">{section.references.map(reference => <li key={reference.url}><a href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title} ↗</a><small>{reference.note}</small></li>)}</ul>}{section.diagram && <figure className="plan-route-diagram"><Image src={section.diagram} alt="本日景点与美食的行程顺序示意，非道路导航" width={900} height={210} unoptimized /></figure>}{section.stops && <div className="illustrated-stops">{section.stops.map((stop) => <article className="illustrated-stop" key={stop.name}><PlanPhoto key={stop.imageUrl || stop.name} url={stop.imageUrl} name={stop.name} /><div><span className="section-kicker">{stop.time} · {stop.category}</span><h4>{stop.name}</h4><p><strong>推荐理由：</strong>{stop.tip}</p>{stop.address && <p className="plan-stop-address">地址：{stop.address}</p>}<p className="plan-stop-task">{stop.category === "美食" ? "到店先确认营业与等位情况，按同行人数点餐，留足用餐和休息时间。" : "抵达后确认预约入口与集合点，按现场开放路线参观；离开前清点同行人员。"}</p><div className="stop-links">{stop.links.filter((link) => link.kind !== "map").map((link) => <a href={link.url} key={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ArrowUpRight size={13} /></a>)}</div></div></article>)}</div>}{section.agenda && <ol className="document-agenda">{section.agenda.map((item, index) => <li key={index}><time>{item.time}</time><div><h4>{item.title}</h4><p>{item.action}</p><span>负责岗位：{item.owner}</span>{item.reference && <p className="agenda-reference"><strong>组织灵感（执行前由负责人确认）：</strong>{item.reference.excerpt}<a href={item.reference.url} target="_blank" rel="noopener noreferrer">{item.reference.title} ↗</a></p>}</div></li>)}</ol>}</section>)}<footer>本规划基于本轮条件与数据生成，执行前请确认现场安排。</footer></article>
    </div>
  </div>;
}

function EvidenceReport({ items, isTourism, places }: { items: EvidenceItem[]; isTourism: boolean; places: string[] }) {
  const [filter, setFilter] = useState("全部");
  const tags = [...new Set(items.map((item) => item.tag))];
  const activeFilter = tags.includes(filter) ? filter : "全部";
  const visible = activeFilter === "全部" ? items : items.filter((item) => item.tag === activeFilter);
  const uncovered = places.filter(place=>!items.some(item=>item.relatedPlaces?.includes(place)));
  return <div className="evidence-layout">
    <aside className="evidence-index"><span className="section-kicker">来源索引</span><strong>{items.length}<small>条参考依据</small></strong>
      <div className="evidence-filters" role="group" aria-label="筛选证据类型">{["全部", ...tags].map((tag) => <button type="button" key={tag} className={activeFilter === tag ? "is-selected" : ""} aria-pressed={activeFilter === tag} onClick={() => setFilter(tag)}><span>{tag}</span><b>{tag === "全部" ? items.length : items.filter((item) => item.tag === tag).length}</b></button>)}</div>
      <div className="report-note"><ShieldCheck size={19} /><p>{isTourism ? "平台链接提供关键词检索入口，景点与餐饮信息请以原始来源为准。" : "环境数据与政策依据共同支持建议，点击来源可核对原文。"}</p></div>
    </aside>
    <section className="evidence-documents" aria-live="polite"><SectionHeading number="01" title={activeFilter === "全部" ? "本次分析的参考依据" : activeFilter} detail={`显示 ${visible.length} 条 · 摘要、发布机构与原文入口`} />
      {places.length > 0 && <div className="report-note"><Info size={18} /><p>地点资料覆盖 {places.length-uncovered.length}/{places.length}。{uncovered.length ? `暂缺关联资料：${uncovered.join("、")}。` : "所有推荐地点均有关联资料。"}资料仅支持所标明的推荐主题；开放、预约和团体接待需另行确认。</p></div>}
      {visible.map((item, index) => <article className="evidence-document" key={item.id ?? `${item.title}-${index}`}>
        <div className="evidence-document-top"><span className="report-badge">{item.tag}</span><span className="evidence-number">{String(index + 1).padStart(2, "0")}</span></div>
        <h3>{item.title}</h3><div className="evidence-meta"><span>{item.publisher || "公开资料"}</span>{item.publishedAt && <time>{item.publishedAt}</time>}</div>
        {item.relatedPlaces?.length ? <p><strong>关联推荐：</strong>{item.relatedPlaces.join("、")}</p> : null}
        {(item.verification || item.tag === "联网检索资料") && <p className="evidence-meta">{item.verification || "搜索摘要 · 尚未核验全文"}</p>}
        {item.retrievedAt && <p className="evidence-meta">检索时间：{new Date(item.retrievedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}（北京时间）</p>}
        {item.section && <div className="evidence-section">{item.section}</div>}<p>{item.excerpt.length > 160 ? item.excerpt.slice(0,160) + "…" : item.excerpt}</p>{item.excerpt.length > 160 && <details><summary>展开原始摘要</summary><p>{item.excerpt}</p></details>}
        {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">查看原始来源 <ArrowUpRight size={15} /></a>}
      </article>)}
      {!visible.length && <div className="report-note"><Info size={18} /><p>暂无可展示的参考依据，请重新生成分析后查看。</p></div>}
    </section>
  </div>;
}

function ActivityPlan({ input, result }: { input: ActivityInput; result: DecisionResult }) {
  const start = `${String(result.bestSlot.hour).padStart(2, "0")}:00`;
  const end = `${String((result.bestSlot.hour + input.duration) % 24).padStart(2, "0")}:00`;
  const steps = [
    { time: "T−60", title: "场地与数据复核", text: "复查逐小时天气、空气质量、疏散通道与应急物资。" },
    { time: "T−30", title: "人员与岗位就位", text: "完成签到分组，明确协调、医疗、补水和秩序岗位。" },
    { time: start, title: `${input.activityType}开始`, text: result.actions.slice(0, 2).join("；") },
    { time: end, title: "结束与复盘", text: "完成清场与人员确认，登记异常，保存环境和执行记录。" },
  ];
  return <>
    <section className="plan-verdict"><div className={`score-ring level-${result.overallLevel}`} style={{ "--score": result.overallScore } as React.CSSProperties}><strong>{result.overallScore}</strong><small>适宜度</small></div>
      <div><span className="report-badge">{result.overallLevel}</span><h2>{result.recommendation}</h2><p>{result.summary}</p></div>
    </section>
    <dl className="report-facts">
      <div><MapPin size={19} /><dt>活动区域</dt><dd>{input.cityName || cityById(input.cityId).name}</dd></div>
      <div><CalendarCheck size={19} /><dt>推荐时间</dt><dd>{result.bestSlot.date || input.date}<small>{start}–{end}</small></dd></div>
      <div><UsersThree size={19} /><dt>参与规模</dt><dd>{input.participants} 人<small>{input.group}</small></dd></div>
    </dl>
    <div className="activity-plan-layout">
      <section className="report-block"><SectionHeading number="01" title="执行时间线" detail="从准备到结束的现场安排" /><ol className="report-timeline">{steps.map((step) => <li key={step.time}><time>{step.time}</time><div><h4>{step.title}</h4><p>{step.text}</p></div></li>)}</ol></section>
      <div className="plan-actions-column"><section className="report-block"><SectionHeading number="02" title="执行措施" detail="按照环境与参与人群调整活动" /><ol className="report-actions">{result.actions.map((action, index) => <li key={action}><span>{String(index + 1).padStart(2, "0")}</span><p>{action}</p></li>)}</ol></section>
        <section className="report-contingency"><ShieldCheck size={22} /><h3>备用预案</h3><p>{result.contingency}</p></section>
      </div>
    </div>
  </>;
}

function TourismPlan({ route }: { route: TourismRoute }) {
  const [selectedDay, setSelectedDay] = useState(1);
  const days = [...new Set(route.stops.map((stop) => stop.day))].sort((a, b) => a - b);
  const activeDay = days.includes(selectedDay) ? selectedDay : days[0];
  const stops = route.stops.map((stop, index) => ({ ...stop, index })).filter((stop) => stop.day === activeDay);
  return <>
    <section className="tourism-report-heading"><span className="report-badge">{route.generatedBy === "llm" ? "AI 编排行程" : "城市 POI 路线"}</span><h2>{route.cityName}{route.dayCount}日旅游路线</h2><p>{route.summary}</p></section>
    <dl className="report-facts"><div><CalendarCheck size={19} /><dt>出行日期</dt><dd>{route.date}<small>至 {route.endDate}</small></dd></div><div><Clock size={19} /><dt>推荐出行时段</dt><dd>{route.bestHours}</dd></div><div><MapPin size={19} /><dt>行程站点</dt><dd>{route.stops.length} 站<small>景点与美食</small></dd></div></dl>
    <div className="tourism-plan-layout"><aside className="trip-day-index"><span className="section-kicker">每日行程</span><nav aria-label="选择行程日期">{days.map((day) => <button type="button" key={day} onClick={() => setSelectedDay(day)} aria-pressed={activeDay === day} className={activeDay === day ? "is-selected" : ""}><strong>第 {day} 天</strong><span>{route.stops.find((stop) => stop.day === day)?.date}</span></button>)}</nav><div className="report-note"><MapPin size={18} /><p>切换到环境地图可查看完整路线与站点位置。</p></div></aside>
      <section className="trip-day-content"><SectionHeading number={String(activeDay ?? 1).padStart(2, "0")} title={`第 ${activeDay ?? 1} 天 · 景点与美食`} detail={`${stops[0]?.date ?? route.date} · ${stops.length} 个停靠点`} />
        <div className="trip-stop-list">{stops.map((stop) => <article className="trip-stop" key={`${stop.day}-${stop.index}`} id={`tour-stop-${stop.index}`}>
          <div className="trip-stop-time"><time>{stop.time}</time><span className={stop.category === "美食" ? "is-food" : ""}>{stop.category}</span></div>
          <div className="trip-stop-main"><div className="trip-stop-copy"><span className="section-kicker">{stop.tag}</span><h3>{stop.name}</h3><p className="stop-reason"><strong>推荐理由</strong>{stop.tip}</p>{stop.address && <address><MapPin size={14} />{stop.address}</address>}<div className="stop-links">{stop.links.filter((link) => link.kind !== "map").map((link) => <a key={`${link.kind}-${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ArrowUpRight size={13} /></a>)}</div></div>
            <PlanPhoto key={stop.imageUrl || stop.name} url={stop.imageUrl} name={stop.name} />
          </div>
        </article>)}</div>
        <section className="report-contingency"><ShieldCheck size={22} /><h3>出行提示</h3>{route.notes.map((note) => <p key={note}>{note}</p>)}</section>
      </section>
    </div>
  </>;
}

export function DecisionResultPanel({ input, isTourism, route, result, liveTrace, activePanel, onPanel, isPlanning, isAnalyzing }: Props) {
  const panelMotion = useSwitchEntrance(activePanel);
  const ready = isTourism ? !!route : !!result;
  const running = isTourism ? isPlanning : isAnalyzing;
  const evidence = isTourism ? route?.evidence ?? [] : result?.evidence ?? [];
  const trace = isTourism ? route?.trace ?? liveTrace : result?.trace ?? liveTrace;
  const document = buildPlanningDocument(input, result, route);
  const tabs: Array<{ key: Panel; label: string; detail: string; icon: typeof Brain }> = [
    { key: "plan", label: isTourism ? "行程方案" : "执行方案", detail: "结论与行动安排", icon: ClipboardText },
    { key: "evidence", label: "数据与证据", detail: "来源与参考依据", icon: Database },
    { key: "trace", label: "Agent 轨迹", detail: "工具与执行结果", icon: Brain },
  ];
  return <section className="decision-panel result-report" aria-label="执行方案报告">
    <header className="report-header"><div><span className="section-kicker">决策报告</span><h1>{isTourism ? "让行程有据可循" : "从分析到现场执行"}</h1><p>{input.cityName || cityById(input.cityId).name} · {input.activityType} · {input.date || "待选择日期"}{input.endDate && input.endDate !== input.date ? ` 至 ${input.endDate}` : ""}</p></div><span className={`report-badge ${running ? "is-warning" : ""}`}>{running ? <Pulse size={15} /> : <CheckCircle size={15} />}{running ? "正在更新" : ready ? "分析已完成" : "等待分析"}</span></header>
    <div className="report-tabs" role="tablist" aria-label="报告内容" onKeyDown={(event) => { const current = tabs.findIndex((tab) => tab.key === activePanel); const next = event.key === "ArrowRight" ? (current + 1) % tabs.length : event.key === "ArrowLeft" ? (current + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1; if (next >= 0) { event.preventDefault(); onPanel(tabs[next].key); window.document.getElementById(`report-tab-${tabs[next].key}`)?.focus(); } }}>
      <SlidingSelection value={activePanel} />
      {tabs.map(({ key, label, detail, icon: Icon }) => <button type="button" role="tab" id={`report-tab-${key}`} aria-selected={activePanel === key} aria-controls={`report-content-${key}`} tabIndex={activePanel === key ? 0 : -1} className={activePanel === key ? "is-active" : ""} key={key} onClick={() => onPanel(key)}><Icon size={22} weight={activePanel === key ? "duotone" : "regular"} /><span><strong>{label}</strong><small>{detail}</small></span></button>)}
    </div>
    <div ref={panelMotion} className={`report-body report-body-${activePanel}`} role="tabpanel" id={`report-content-${activePanel}`} aria-labelledby={`report-tab-${activePanel}`} tabIndex={0}>
      {!ready && !(activePanel === "trace" && trace.length > 0) ? <div className="report-empty">{running ? <Pulse size={36} /> : isTourism ? <Binoculars size={36} /> : <Sparkle size={36} />}<h2>{running ? "正在准备这份报告" : "先完成一次对话分析"}</h2><p>{running ? "工具返回后，方案、证据与执行轨迹会自动更新。" : "在分析台描述城市、日期与活动需求，完成后即可在这里查看详细内容。"}</p><a href="/XingZhi">返回分析台 <ArrowUpRight size={16} /></a></div>
        : activePanel === "plan" ? <>{document && <PlanDocumentReader document={document} />}<details className="structured-plan"><summary>{isTourism ? "查看按天行程与地点图片" : "查看时间线与执行卡片"}</summary>{isTourism && route ? <TourismPlan key={`${route.cityName}-${route.date}-${route.endDate}`} route={route} /> : result && <ActivityPlan input={input} result={result} />}</details></>
        : activePanel === "evidence" ? <EvidenceReport items={evidence} isTourism={isTourism} places={isTourism ? route?.stops.map(stop=>stop.name) || [] : result?.venues?.map(venue=>venue.name) || []} />
        : <TraceVisualizer items={trace} running={running} totalDurationMs={isTourism ? route?.totalDurationMs : result?.totalDurationMs} />}
    </div>
  </section>;
}
