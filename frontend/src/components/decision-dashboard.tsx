"use client";

import {
  ArrowClockwise, Brain, CalendarBlank, CaretDown, CheckCircle, CloudSun, Compass,
  Database, Drop, Gauge, Info, Lightning, MapPin, Path, ShieldCheck, Sparkle,
  ThermometerSimple, UsersThree, WarningCircle, Wind,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EnvironmentMap } from "./environment-map";
import { cities, cityById } from "@/lib/cities";
import type { ActivityInput, ActivityType, CityEnvironment, DecisionResult, GroupType, Intensity, LayerKey } from "@/lib/types";

const layers: Array<{ key: LayerKey; label: string; icon: typeof Gauge }> = [
  { key: "comfort", label: "活动适宜度", icon: Gauge },
  { key: "temperature", label: "气温", icon: ThermometerSimple },
  { key: "humidity", label: "湿度", icon: Drop },
  { key: "aqi", label: "US AQI", icon: Wind },
  { key: "heat", label: "热风险", icon: CloudSun },
];
const activityTypes: ActivityType[] = ["校园运动会", "体育课", "社区活动", "户外训练", "研学活动"];
const intensities: Intensity[] = ["低强度", "中强度", "高强度"];
const groups: GroupType[] = ["普通人群", "儿童青少年", "老年人", "敏感人群"];

function dateString(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const initialInput: ActivityInput = {
  cityId: "hangzhou", activityType: "校园运动会", date: "",
  startHour: 14, duration: 2, participants: 500, intensity: "中强度", group: "儿童青少年",
  locationName: "杭州某学校操场",
};

async function apiError(response: Response) {
  try {
    const body = await response.json() as { detail?: string };
    return body.detail || `服务返回 ${response.status}`;
  } catch {
    return `服务返回 ${response.status}`;
  }
}

export function DecisionDashboard() {
  const [input, setInput] = useState<ActivityInput>(initialInput);
  const [layer, setLayer] = useState<LayerKey>("comfort");
  const [city, setCity] = useState<CityEnvironment | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [isLoadingCity, setIsLoadingCity] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"plan" | "evidence" | "trace">("plan");
  const [dateRange, setDateRange] = useState({ min: "", max: "" });
  const selectedCity = useMemo(() => cityById(input.cityId), [input.cityId]);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

  const loadCity = useCallback(async (cityId: string, signal?: AbortSignal) => {
    try {
      const response = await fetch(`${apiBase}/api/v1/cities/${cityId}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error(await apiError(response));
      setCity(await response.json() as CityEnvironment);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setCity(null);
      setError(caught instanceof Error ? caught.message : "实时环境数据加载失败");
    } finally {
      if (!signal?.aborted) setIsLoadingCity(false);
    }
  }, [apiBase]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void loadCity(input.cityId, controller.signal));
    return () => controller.abort();
  }, [input.cityId, loadCity]);

  useEffect(() => {
    queueMicrotask(() => {
      const today = dateString();
      setDateRange({ min: today, max: dateString(4) });
      setInput((current) => current.date ? current : { ...current, date: today });
    });
  }, []);

  const updateInput = <K extends keyof ActivityInput>(key: K, value: ActivityInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  const onPointSelected = useCallback((name: string) => setInput((current) => ({ ...current, locationName: name })), []);
  const showPanel = (panel: "plan" | "evidence" | "trace") => {
    setActivePanel(panel);
    if (window.innerWidth <= 820) document.querySelector(".decision-panel")?.scrollIntoView({ behavior: "smooth" });
  };
  const changeCity = (cityId: string) => {
    const nextCity = cityById(cityId);
    setIsLoadingCity(true);
    setError(null);
    setCity(null);
    setResult(null);
    setInput((current) => ({ ...current, cityId, locationName: `${nextCity.name.replace("市", "")}活动场地` }));
  };

  async function analyze() {
    setIsAnalyzing(true);
    setError(null);
    const startedAt = Date.now();
    try {
      const response = await fetch(`${apiBase}/api/v1/decisions/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(await apiError(response));
      setResult(await response.json() as DecisionResult);
      await loadCity(input.cityId);
      setActivePanel("plan");
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "决策服务暂时不可用");
    } finally {
      const elapsed = Date.now() - startedAt;
      window.setTimeout(() => setIsAnalyzing(false), Math.max(0, 520 - elapsed));
    }
  }

  const updatedAt = city ? new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(city.updatedAt)) : "";

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
          <span className={`system-status ${error ? "has-error" : ""}`}><i /> {error ? "数据连接异常" : isLoadingCity ? "正在同步实时数据" : `实时数据 · ${updatedAt}`}</span>
          <button className="icon-button" type="button" onClick={() => showPanel("evidence")} aria-label="查看数据说明"><Info size={19} /></button>
          <div className="avatar">SH</div>
        </div>
      </header>

      <section className="workspace">
        <aside className="control-rail">
          <div className="rail-heading">
            <div><span className="section-kicker">活动条件</span><h1>规划一次更合适的户外活动</h1></div>
            <button type="button" className="icon-button compact" onClick={() => { const sameCity = input.cityId === initialInput.cityId; setError(null); setResult(null); setInput({ ...initialInput, date: dateString() }); if (!sameCity) { setIsLoadingCity(true); setCity(null); } else { void loadCity(initialInput.cityId); } }} aria-label="重置活动条件"><ArrowClockwise size={17} /></button>
          </div>
          <FieldLabel htmlFor="city">所在城市</FieldLabel>
          <div className="select-wrap"><MapPin size={17} /><select id="city" value={input.cityId} onChange={(event) => changeCity(event.target.value)}>{cities.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.province}</option>)}</select><CaretDown size={14} /></div>
          <FieldLabel htmlFor="location">活动地点</FieldLabel>
          <div className="input-wrap"><Path size={17} /><input id="location" value={input.locationName} onChange={(event) => updateInput("locationName", event.target.value)} /></div>
          <div className="field-grid">
            <div><FieldLabel htmlFor="date">活动日期</FieldLabel><div className="input-wrap"><CalendarBlank size={17} /><input id="date" type="date" min={dateRange.min} max={dateRange.max} value={input.date} onChange={(event) => { updateInput("date", event.target.value); setResult(null); }} /></div></div>
            <div><FieldLabel htmlFor="hour">开始时间</FieldLabel><div className="select-wrap no-icon"><select id="hour" value={input.startHour} onChange={(event) => updateInput("startHour", Number(event.target.value))}>{Array.from({ length: 15 }, (_, index) => index + 6).map((hour) => <option value={hour} key={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select><CaretDown size={14} /></div></div>
          </div>
          <FieldLabel htmlFor="activity">活动类型</FieldLabel>
          <div className="select-wrap"><Lightning size={17} /><select id="activity" value={input.activityType} onChange={(event) => updateInput("activityType", event.target.value as ActivityType)}>{activityTypes.map((item) => <option value={item} key={item}>{item}</option>)}</select><CaretDown size={14} /></div>
          <div className="field-grid">
            <div><FieldLabel htmlFor="participants">参与人数</FieldLabel><div className="input-wrap"><UsersThree size={17} /><input id="participants" type="number" min="1" value={input.participants} onChange={(event) => updateInput("participants", Number(event.target.value))} /></div></div>
            <div><FieldLabel htmlFor="duration">时长</FieldLabel><div className="select-wrap no-icon"><select id="duration" value={input.duration} onChange={(event) => updateInput("duration", Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((hour) => <option value={hour} key={hour}>{hour} 小时</option>)}</select><CaretDown size={14} /></div></div>
          </div>
          <FieldLabel>活动强度</FieldLabel>
          <div className="segmented-control">{intensities.map((item) => <button type="button" key={item} className={input.intensity === item ? "is-selected" : ""} onClick={() => updateInput("intensity", item)}>{item.replace("强度", "")}</button>)}</div>
          <FieldLabel htmlFor="group">参与人群</FieldLabel>
          <div className="select-wrap"><UsersThree size={17} /><select id="group" value={input.group} onChange={(event) => updateInput("group", event.target.value as GroupType)}>{groups.map((item) => <option value={item} key={item}>{item}</option>)}</select><CaretDown size={14} /></div>
          {error && <div className="error-notice" role="alert"><WarningCircle size={17} /><span>{error}</span></div>}
          <button className="analyze-button" type="button" onClick={analyze} disabled={isAnalyzing || isLoadingCity || !city || !input.date}>{isAnalyzing ? <span className="button-loader" /> : <Sparkle size={19} weight="fill" />}{isAnalyzing ? "Agent 正在分析" : "生成活动决策"}</button>
          <p className="rail-footnote"><ShieldCheck size={14} /> 实时预报计算，AI 仅生成可解释文字</p>
        </aside>

        <section className="map-workbench">
          <div className="city-summary">
            <div><span className="section-kicker">{selectedCity.province} · {selectedCity.adcode} · {city ? `更新于 ${updatedAt}` : "正在连接数据源"}</span><h2>{selectedCity.name}环境决策图</h2></div>
            <div className="city-metrics" aria-label="城市环境概览">
              <Metric icon={ThermometerSimple} value={city ? `${city.temperature}°` : "--"} label="气温" />
              <Metric icon={Drop} value={city ? `${city.humidity}%` : "--"} label="湿度" />
              <Metric icon={Wind} value={city ? `${city.aqi}` : "--"} label="US AQI" />
              <Metric icon={CloudSun} value={city ? `${city.heatRisk}` : "--"} label="热风险" />
            </div>
          </div>
          <div className="layer-bar" aria-label="环境图层">{layers.map((item) => { const Icon = item.icon; return <button type="button" key={item.key} className={layer === item.key ? "is-active" : ""} onClick={() => setLayer(item.key)}><Icon size={16} /> {item.label}</button>; })}</div>
          {city ? <EnvironmentMap city={city} layer={layer} onPointSelected={onPointSelected} /> : <div className="map-shell map-unavailable"><span className="button-loader dark" /><p>{error ? "实时数据暂不可用" : "正在载入城市环境数据"}</p></div>}
          <div className="timeline-card">
            <div className="timeline-header"><div><span className="section-kicker">逐小时预报</span><h3>全天活动适宜度</h3></div><div className="legend"><span className="good" />适宜 <span className="caution" />谨慎 <span className="bad" />不建议</div></div>
            {result ? <div className="slot-chart">{result.slots.map((slot) => <button type="button" key={slot.hour} className={`slot-column ${slot.hour === result.bestSlot.hour ? "is-best" : ""}`} onClick={() => updateInput("startHour", slot.hour)} aria-label={`${slot.label}适宜度${slot.score}`}><span className="slot-score">{slot.hour === result.bestSlot.hour ? slot.score : ""}</span><span className={`slot-bar level-${slot.level}`} style={{ height: `${Math.max(18, slot.score)}%` }} /><span className="slot-time">{slot.hour}</span></button>)}</div> : <div className="timeline-empty">选择活动条件后生成逐小时决策</div>}
          </div>
        </section>

        <aside className="decision-panel">
          <div className="panel-tabs" role="tablist"><button type="button" className={activePanel === "plan" ? "is-active" : ""} onClick={() => setActivePanel("plan")}>方案</button><button type="button" className={activePanel === "evidence" ? "is-active" : ""} onClick={() => setActivePanel("evidence")}>证据</button><button type="button" className={activePanel === "trace" ? "is-active" : ""} onClick={() => setActivePanel("trace")}>Agent轨迹</button></div>
          {!result && <div className="panel-content empty-state"><Sparkle size={30} weight="duotone" /><h2>等待生成决策</h2><p>系统将读取所选日期的真实逐小时预报，比较 15 个候选时段并生成行动建议。</p></div>}
          {result && activePanel === "plan" && <div className="panel-content panel-enter">
            <div className="score-hero"><div className={`score-ring level-${result.overallLevel}`} style={{ "--score": result.overallScore } as React.CSSProperties}><strong>{result.overallScore}</strong><small>适宜度</small></div><div><span className="decision-status"><CheckCircle size={15} weight="fill" /> {result.overallLevel}</span><h2>{result.recommendation}</h2><p>{result.generatedBy === "deepseek" ? "DeepSeek 增强解释 · 实时环境预报" : "规则解释 · 实时环境预报"}</p></div></div>
            <div className="summary-block"><Brain size={20} weight="duotone" /><p>{result.summary}</p></div>
            <section className="recommend-section"><span className="section-kicker">执行措施</span><div className="action-list">{result.actions.map((action, index) => <div className="action-row" key={action}><span>{String(index + 1).padStart(2, "0")}</span><p>{action}</p></div>)}</div></section>
            <section className="contingency"><div><ShieldCheck size={18} /><strong>备用预案</strong></div><p>{result.contingency}</p></section>
          </div>}
          {result && activePanel === "evidence" && <div className="panel-content panel-enter"><PanelTitle icon={Database} title="依据与数据来源" subtitle="每项建议都能回到计算和原始依据" /><div className="evidence-list">{result.evidence.map((item) => <article key={item.title}><span>{item.tag}</span><h3>{item.title}</h3><p>{item.excerpt}</p><small>{item.publisher}</small></article>)}</div><div className="data-note"><Info size={18} /><p>天气与降雨来自 Open-Meteo 逐小时预报；空气质量为 Open-Meteo US AQI 模型数据；热风险由体感温度和湿度计算。数据为城市坐标附近的网格预报，不代表单一监测站。</p></div></div>}
          {result && activePanel === "trace" && <div className="panel-content panel-enter"><PanelTitle icon={Brain} title="决策执行轨迹" subtitle="环境读取、依据检索、计算与时段比较" /><div className="trace-list">{result.trace.map((item, index) => <div className="trace-item" key={item.id}><div className="trace-index">{index + 1}</div><div><strong>{item.name}</strong><p>{item.detail}</p></div><span className={item.status}>{item.status === "fallback" ? "规则兜底" : "完成"}</span></div>)}</div><div className="trace-footer"><ShieldCheck size={17} /> 数值由实时数据和同一计算流程产生</div></div>}
        </aside>
      </section>
    </main>
  );
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) { return <label className="field-label" htmlFor={htmlFor}>{children}</label>; }
function Metric({ icon: Icon, value, label }: { icon: typeof Gauge; value: string; label: string }) { return <div className="metric-item"><Icon size={18} /><div><strong>{value}</strong><span>{label}</span></div></div>; }
function PanelTitle({ icon: Icon, title, subtitle }: { icon: typeof Brain; title: string; subtitle: string }) { return <div className="panel-title"><Icon size={20} /><div><h2>{title}</h2><p>{subtitle}</p></div></div>; }
