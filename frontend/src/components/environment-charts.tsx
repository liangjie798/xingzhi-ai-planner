"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { CityEnvironment, GridPoint, LayerKey } from "@/lib/types";
gsap.registerPlugin(useGSAP);
interface Hour { hour: number; temperature: number; humidity: number; rainProbability: number; aqi: number; heatRisk: number }
const metrics = { temperature: ["气温", "℃"], humidity: ["湿度", "%"], aqi: ["US AQI", ""], heat: ["热风险", ""], comfort: ["环境适宜度", "分"] } as const;
function value(point: Hour | GridPoint, layer: LayerKey) { return layer === "heat" ? point.heatRisk : layer === "comfort" ? Math.round(Math.max(0, 100 - point.heatRisk * .42 - Math.max(0, point.aqi - 35) * .21 - point.rainProbability * .18)) : point[layer]; }

export function EnvironmentCharts({ city, date, grid }: { city: CityEnvironment; date: string; grid: GridPoint[] }) {
  const [hours, setHours] = useState<Hour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState<LayerKey>("temperature");
  const [selected, setSelected] = useState(12);
  const [retry, setRetry] = useState(0);
  const root = useRef<HTMLElement>(null);
  const gradient = useId().replace(/:/g, "");
  const [longitude, latitude] = city.center;
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ cityId: city.id, name: city.name, province: city.province, adcode: city.adcode, longitude: String(longitude), latitude: String(latitude), date });
    queueMicrotask(() => { if (!controller.signal.aborted) { setLoading(true); setError(""); setHours([]); } });
    void fetch(`/api/v1/cities/hourly?${query}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("逐小时数据暂不可用");
      const payload = await response.json() as { hours: Hour[] };
      if (!Array.isArray(payload.hours) || !payload.hours.length) throw new Error("当前日期暂无逐小时数据");
      if (!controller.signal.aborted) setHours(payload.hours.filter((point) => Number.isFinite(point.hour) && Number.isFinite(point.temperature)).sort((a, b) => a.hour - b.hour));
    }).catch((e) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "数据暂不可用"); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [city.id, city.name, city.province, city.adcode, longitude, latitude, date, retry]);
  useGSAP(() => {
    if (!hours.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(".environment-line", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.6, ease: "power2.out" });
    gsap.fromTo(".environment-rain-bar", { scaleY: 0, transformOrigin: "bottom" }, { scaleY: 1, stagger: .018, duration: .65, ease: "power2.out" });
  }, { scope: root, dependencies: [hours, metric], revertOnUpdate: true });
  const values = useMemo(() => hours.map((point) => value(point, metric)), [hours, metric]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const span = Math.max(max - min, 1);
  const x = (i: number) => 36 + i * 684 / Math.max(1, hours.length - 1);
  const y = (n: number) => 176 - (n - min) / span * 132;
  const path = values.map((n, i) => `${i ? "L" : "M"}${x(i)},${y(n)}`).join(" ");
  const index = Math.min(selected, Math.max(0, hours.length - 1));
  const current = hours[index];
  return <section className="environment-dashboard" ref={root} aria-label="环境数据可视化">
    <header><div><span className="section-kicker">环境数据实验室 · {date}</span><h2>从地图，读到每一个小时。</h2><p>{city.name} · 逐小时预报与区域采样，独立于方案生成</p></div><a href="/hourly">完整逐小时页面 →</a></header>
    {loading ? <div className="environment-data-state"><span className="button-loader dark" />正在读取真实逐小时预报…</div> : error ? <div className="environment-data-state" role="alert">{error}<button onClick={() => setRetry((n) => n + 1)}>重新加载</button></div> : <>
      <div className="environment-facts"><article><span>气温区间</span><strong>{Math.min(...hours.map((p) => p.temperature))}–{Math.max(...hours.map((p) => p.temperature))}<small>℃</small></strong></article><article><span>最高降雨概率</span><strong>{Math.max(...hours.map((p) => p.rainProbability))}<small>%</small></strong></article><article><span>US AQI 区间</span><strong>{Math.min(...hours.map((p) => p.aqi))}–{Math.max(...hours.map((p) => p.aqi))}</strong></article><article><span>有效预报</span><strong>{hours.length}<small>小时</small></strong></article></div>
      <div className="environment-chart-grid"><article className="environment-trend"><header><h3>全天环境变化</h3><div role="group" aria-label="选择趋势指标">{(Object.keys(metrics) as LayerKey[]).map((key) => <button key={key} className={metric === key ? "is-active" : ""} onClick={() => setMetric(key)} aria-pressed={metric === key}>{metrics[key][0]}</button>)}</div></header>
        <div className="environment-readout"><time>{String(current?.hour ?? 0).padStart(2, "0")}:00</time><strong>{current ? value(current, metric) : "--"}{metrics[metric][1]}</strong><span>移动指针或下方滑块查看小时</span></div>
        <svg viewBox="0 0 760 220" role="img" aria-label={`${date}${metrics[metric][0]}趋势，最低${min}，最高${max}`} onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const px = (event.clientX - rect.left) / rect.width * 760; setSelected(Math.max(0, Math.min(hours.length - 1, Math.round((px - 36) / 684 * (hours.length - 1))))); }}>
          <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3e8962" stopOpacity=".22" /><stop offset="100%" stopColor="#3e8962" stopOpacity="0" /></linearGradient></defs>
          {[0, .5, 1].map((n) => <g key={n}><line x1="36" x2="720" y1={y(min + span * n)} y2={y(min + span * n)} stroke="#dce5d5" strokeDasharray="4 5" /><text x="4" y={y(min + span * n) + 4}>{(min + span * n).toFixed(metric === "temperature" ? 1 : 0)}</text></g>)}
          <path d={`${path} L${x(hours.length - 1)},185 L36,185 Z`} fill={`url(#${gradient})`} /><path className="environment-line" d={path} pathLength="1" strokeDasharray="1" fill="none" stroke="#31754d" strokeWidth="3" />
          <line x1={x(index)} x2={x(index)} y1="30" y2="185" stroke="#8da487" strokeDasharray="3 4" /><circle cx={x(index)} cy={y(values[index] ?? 0)} r="5" fill="#315d40" stroke="white" strokeWidth="2" />
          {hours.map((p, i) => i % 4 === 0 && <text x={x(i)} y="210" textAnchor="middle" key={p.hour}>{String(p.hour).padStart(2, "0")}:00</text>)}
        </svg><input aria-label="查看小时数据" type="range" min="0" max={Math.max(0, hours.length - 1)} value={index} onChange={(event) => setSelected(Number(event.target.value))} />
      </article><article className="environment-rain"><header><h3>逐小时降雨概率</h3><span>0–100%</span></header><div className="environment-rain-columns">{hours.map((p) => <button key={p.hour} title={`${p.hour}:00 降雨概率 ${p.rainProbability}%`} onClick={() => setSelected(hours.indexOf(p))}><span className="environment-rain-bar" style={{ height: `${Math.max(2, p.rainProbability)}%` }} /><small>{p.hour % 4 === 0 ? p.hour : ""}</small></button>)}</div><p>降雨概率表示发生可能性，并非降雨量。</p></article></div>
      <article className="environment-region"><header><div><h3>区域采样对比 · 环境适宜度</h3><p>按实际采样经纬度展示，连续地图由这些点插值得到；不是区县官方监测站。</p></div></header>{grid.length ? <div>{grid.map((point) => <div key={`${point.longitude}-${point.latitude}`}><span>{point.longitude.toFixed(2)}°E / {point.latitude.toFixed(2)}°N</span><i><b style={{ width: `${value(point, "comfort")}%` }} /></i><strong>{value(point, "comfort")}</strong></div>)}</div> : <p>行政区采样正在载入；逐小时图表仍可独立查看。</p>}</article>
      <details className="environment-table"><summary>查看原始逐小时数据与来源</summary><div><table><thead><tr>{["时刻", "气温℃", "湿度%", "US AQI", "降雨概率%", "热风险"].map((t) => <th key={t}>{t}</th>)}</tr></thead><tbody>{hours.map((p) => <tr key={p.hour}><td>{p.hour}:00</td><td>{p.temperature}</td><td>{p.humidity}</td><td>{p.aqi}</td><td>{p.rainProbability}</td><td>{p.heatRisk}</td></tr>)}</tbody></table></div><p>来源：Open-Meteo 逐小时预报；远期空气质量缺失时可能沿用最近可用日同小时值，执行前复核。</p></details>
    </>}
  </section>;
}
