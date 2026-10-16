"use client";

import {
  ArrowClockwise, Brain, CalendarBlank, CaretDown, CheckCircle, CloudSun, Compass,
  Database, Drop, Gauge, Info, Lightning, MapPin, Path, ShieldCheck, Sparkle,
  ThermometerSimple, UsersThree, Wind,
} from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";
import { EnvironmentMap } from "./environment-map";
import { cities, cityById } from "@/lib/cities";
import { createDeterministicDecision } from "@/lib/risk";
import type { ActivityInput, ActivityType, DecisionResult, GroupType, Intensity, LayerKey } from "@/lib/types";

const layers: Array<{ key: LayerKey; label: string; icon: typeof Gauge }> = [
  { key: "comfort", label: "活动适宜度", icon: Gauge },
  { key: "temperature", label: "气温", icon: ThermometerSimple },
  { key: "humidity", label: "湿度", icon: Drop },
  { key: "aqi", label: "AQI", icon: Wind },
  { key: "heat", label: "热风险", icon: CloudSun },
];
const activityTypes: ActivityType[] = ["校园运动会", "体育课", "社区活动", "户外训练", "研学活动"];
const intensities: Intensity[] = ["低强度", "中强度", "高强度"];
const groups: GroupType[] = ["普通人群", "儿童青少年", "老年人", "敏感人群"];
const initialInput: ActivityInput = {
  cityId: "hangzhou", activityType: "校园运动会", date: new Date().toISOString().slice(0, 10),
  startHour: 14, duration: 2, participants: 500, intensity: "中强度", group: "儿童青少年",
  locationName: "杭州某学校操场",
};

export function DecisionDashboard() {
  const [input, setInput] = useState<ActivityInput>(initialInput);
  const [layer, setLayer] = useState<LayerKey>("comfort");
  const [result, setResult] = useState<DecisionResult>(() => createDeterministicDecision(initialInput));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activePanel, setActivePanel] = useState<"plan" | "evidence" | "trace">("plan");
  const city = useMemo(() => cityById(input.cityId), [input.cityId]);
  const updateInput = <K extends keyof ActivityInput>(key: K, value: ActivityInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  const onPointSelected = useCallback((name: string) => setInput((current) => ({ ...current, locationName: name })), []);
  const showPanel = (panel: "plan" | "evidence" | "trace") => {
    setActivePanel(panel);
    if (window.innerWidth <= 820) document.querySelector(".decision-panel")?.scrollIntoView({ behavior: "smooth" });
  };

  async function analyze() {
    setIsAnalyzing(true);
    const startedAt = Date.now();
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
      const response = await fetch(`${baseUrl}/api/v1/decisions/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error("decision api unavailable");
      setResult((await response.json()) as DecisionResult);
    } catch {
      setResult(createDeterministicDecision(input));
    } finally {
      const elapsed = Date.now() - startedAt;
      window.setTimeout(() => setIsAnalyzing(false), Math.max(0, 780 - elapsed));
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true"><Compass size={23} weight="duotone" /></div>
          <div><p className="brand-name">适候</p><p className="brand-subtitle">户外活动环境决策系统</p></div>
        </div>
        <nav className="primary-nav" aria-label="主导航">
          <button type="button" className={`nav-item ${activePanel === "plan" ? "is-active" : ""}`} onClick={() => showPanel("plan")}>决策工作台</button>
          <button type="button" className={`nav-item ${activePanel === "evidence" ? "is-active" : ""}`} onClick={() => showPanel("evidence")}>数据与依据</button>
          <button type="button" className={`nav-item ${activePanel === "trace" ? "is-active" : ""}`} onClick={() => showPanel("trace")}>Agent轨迹</button>
        </nav>
        <div className="topbar-actions">
          <span className="system-status"><i /> 演示数据模式</span>
          <button className="icon-button" type="button" onClick={() => showPanel("evidence")} aria-label="查看数据说明"><Info size={19} /></button>
          <div className="avatar">SH</div>
        </div>
      </header>

      <section className="workspace">
        <aside className="control-rail">
          <div className="rail-heading">
            <div><span className="section-kicker">活动条件</span><h1>规划一次更合适的户外活动</h1></div>
            <button type="button" className="icon-button compact" onClick={() => setInput(initialInput)} aria-label="重置活动条件"><ArrowClockwise size={17} /></button>
          </div>
          <FieldLabel htmlFor="city">所在城市</FieldLabel>
          <div className="select-wrap"><MapPin size={17} /><select id="city" value={input.cityId} onChange={(e) => updateInput("cityId", e.target.value)}>{cities.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.province}</option>)}</select><CaretDown size={14} /></div>
          <FieldLabel htmlFor="location">活动地点</FieldLabel>
          <div className="input-wrap"><Path size={17} /><input id="location" value={input.locationName} onChange={(e) => updateInput("locationName", e.target.value)} /></div>
          <div className="field-grid">
            <div><FieldLabel htmlFor="date">活动日期</FieldLabel><div className="input-wrap"><CalendarBlank size={17} /><input id="date" type="date" value={input.date} onChange={(e) => updateInput("date", e.target.value)} /></div></div>
            <div><FieldLabel htmlFor="hour">开始时间</FieldLabel><div className="select-wrap no-icon"><select id="hour" value={input.startHour} onChange={(e) => updateInput("startHour", Number(e.target.value))}>{Array.from({ length: 15 }, (_, index) => index + 6).map((hour) => <option value={hour} key={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select><CaretDown size={14} /></div></div>
          </div>
          <FieldLabel htmlFor="activity">活动类型</FieldLabel>
          <div className="select-wrap"><Lightning size={17} /><select id="activity" value={input.activityType} onChange={(e) => updateInput("activityType", e.target.value as ActivityType)}>{activityTypes.map((item) => <option value={item} key={item}>{item}</option>)}</select><CaretDown size={14} /></div>
          <div className="field-grid">
            <div><FieldLabel htmlFor="participants">参与人数</FieldLabel><div className="input-wrap"><UsersThree size={17} /><input id="participants" type="number" min="1" value={input.participants} onChange={(e) => updateInput("participants", Number(e.target.value))} /></div></div>
            <div><FieldLabel htmlFor="duration">时长</FieldLabel><div className="select-wrap no-icon"><select id="duration" value={input.duration} onChange={(e) => updateInput("duration", Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((hour) => <option value={hour} key={hour}>{hour} 小时</option>)}</select><CaretDown size={14} /></div></div>
          </div>
          <FieldLabel>活动强度</FieldLabel>
          <div className="segmented-control">{intensities.map((item) => <button type="button" key={item} className={input.intensity === item ? "is-selected" : ""} onClick={() => updateInput("intensity", item)}>{item.replace("强度", "")}</button>)}</div>
          <FieldLabel htmlFor="group">参与人群</FieldLabel>
          <div className="select-wrap"><UsersThree size={17} /><select id="group" value={input.group} onChange={(e) => updateInput("group", e.target.value as GroupType)}>{groups.map((item) => <option value={item} key={item}>{item}</option>)}</select><CaretDown size={14} /></div>
          <button className="analyze-button" type="button" onClick={analyze} disabled={isAnalyzing}>{isAnalyzing ? <span className="button-loader" /> : <Sparkle size={19} weight="fill" />}{isAnalyzing ? "Agent 正在分析" : "生成活动决策"}</button>
          <p className="rail-footnote"><ShieldCheck size={14} /> 风险数值由规则计算，DeepSeek 可增强解释</p>
        </aside>

        <section className="map-workbench">
          <div className="city-summary">
            <div><span className="section-kicker">{city.province} · {city.adcode} · 演示数据</span><h2>{city.name}环境决策图</h2></div>
            <div className="city-metrics" aria-label="城市环境概览">
              <Metric icon={ThermometerSimple} value={`${city.temperature}°`} label="气温" />
              <Metric icon={Drop} value={`${city.humidity}%`} label="湿度" />
              <Metric icon={Wind} value={`${city.aqi}`} label="AQI" />
              <Metric icon={CloudSun} value={`${city.heatRisk}`} label="热风险" />
            </div>
          </div>
          <div className="layer-bar" aria-label="环境图层">{layers.map((item) => { const Icon = item.icon; return <button type="button" key={item.key} className={layer === item.key ? "is-active" : ""} onClick={() => setLayer(item.key)}><Icon size={16} /> {item.label}</button>; })}</div>
          <EnvironmentMap city={city} layer={layer} onPointSelected={onPointSelected} />
          <div className="timeline-card">
            <div className="timeline-header"><div><span className="section-kicker">候选时段推演</span><h3>全天活动适宜度</h3></div><div className="legend"><span className="good" />适宜 <span className="caution" />谨慎 <span className="bad" />不建议</div></div>
            <div className="slot-chart">{result.slots.map((slot) => <button type="button" key={slot.hour} className={`slot-column ${slot.hour === result.bestSlot.hour ? "is-best" : ""}`} onClick={() => updateInput("startHour", slot.hour)} aria-label={`${slot.label}适宜度${slot.score}`}><span className="slot-score">{slot.hour === result.bestSlot.hour ? slot.score : ""}</span><span className={`slot-bar level-${slot.level}`} style={{ height: `${Math.max(18, slot.score)}%` }} /><span className="slot-time">{slot.hour}</span></button>)}</div>
          </div>
        </section>

        <aside className="decision-panel">
          <div className="panel-tabs" role="tablist"><button type="button" className={activePanel === "plan" ? "is-active" : ""} onClick={() => setActivePanel("plan")}>方案</button><button type="button" className={activePanel === "evidence" ? "is-active" : ""} onClick={() => setActivePanel("evidence")}>证据</button><button type="button" className={activePanel === "trace" ? "is-active" : ""} onClick={() => setActivePanel("trace")}>Agent轨迹</button></div>
          {activePanel === "plan" && <div className="panel-content panel-enter">
            <div className="score-hero"><div className={`score-ring level-${result.overallLevel}`} style={{ "--score": result.overallScore } as React.CSSProperties}><strong>{result.overallScore}</strong><small>适宜度</small></div><div><span className="decision-status"><CheckCircle size={15} weight="fill" /> {result.overallLevel}</span><h2>{result.recommendation}</h2><p>{result.generatedBy === "deepseek" ? "DeepSeek 增强解释 · 演示环境数据" : "规则计算 · 演示环境数据"}</p></div></div>
            <div className="summary-block"><Brain size={20} weight="duotone" /><p>{result.summary}</p></div>
            <section className="recommend-section"><span className="section-kicker">执行措施</span><div className="action-list">{result.actions.map((action, index) => <div className="action-row" key={action}><span>{String(index + 1).padStart(2, "0")}</span><p>{action}</p></div>)}</div></section>
            <section className="contingency"><div><ShieldCheck size={18} /><strong>备用预案</strong></div><p>{result.contingency}</p></section>
          </div>}
          {activePanel === "evidence" && <div className="panel-content panel-enter"><PanelTitle icon={Database} title="依据与数据来源" subtitle="每项建议都能回到计算和原始依据" /><div className="evidence-list">{result.evidence.map((item) => <article key={item.title}><span>{item.tag}</span><h3>{item.title}</h3><p>{item.excerpt}</p><small>{item.publisher}</small></article>)}</div><div className="data-note"><Info size={18} /><p>当前环境快照用于功能演示。接入正式数据源后，界面将显示观测时间、站点和授权信息。</p></div></div>}
          {activePanel === "trace" && <div className="panel-content panel-enter"><PanelTitle icon={Brain} title="决策执行轨迹" subtitle="环境读取、依据检索、计算与时段比较" /><div className="trace-list">{result.trace.map((item, index) => <div className="trace-item" key={item.id}><div className="trace-index">{index + 1}</div><div><strong>{item.name}</strong><p>{item.detail}</p></div><span className={item.status}>{item.status === "fallback" ? "演示" : "完成"}</span></div>)}</div><div className="trace-footer"><ShieldCheck size={17} /> 数值由同一计算流程产生，依据可单独查看</div></div>}
        </aside>
      </section>
    </main>
  );
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) { return <label className="field-label" htmlFor={htmlFor}>{children}</label>; }
function Metric({ icon: Icon, value, label }: { icon: typeof Gauge; value: string; label: string }) { return <div className="metric-item"><Icon size={18} /><div><strong>{value}</strong><span>{label}</span></div></div>; }
function PanelTitle({ icon: Icon, title, subtitle }: { icon: typeof Brain; title: string; subtitle: string }) { return <div className="panel-title"><Icon size={20} /><div><h2>{title}</h2><p>{subtitle}</p></div></div>; }
