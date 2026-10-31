"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { EnvironmentalForecastPoint } from "@/lib/types";
import type { WeatherChartSpec } from "@/lib/visualization-request";

gsap.registerPlugin(useGSAP);
export interface WeatherComparisonData { spec: WeatherChartSpec; points: EnvironmentalForecastPoint[]; missingDates: string[]; cityName: string }
const colors = ["#286348", "#ad6a27", "#6573a5", "#b05b61", "#548878", "#946ba1", "#607c93"];
type Metric = WeatherChartSpec["metrics"][number];
// Validate plotted values independently. Duplicate or invalid hours remain gaps.
function usableValue(row: EnvironmentalForecastPoint, metric: Metric) {
  const value = row[metric];
  return Number.isInteger(row.hour) && row.hour >= 0 && row.hour <= 23 && Number.isFinite(value)
    && (metric === "temperature" ? value >= -90 && value <= 60 : value >= 0 && value <= 100);
}

export function WeatherComparison({ data }: { data: WeatherComparisonData }) {
  const [selectedMetric, setMetric] = useState<Metric>(data.spec.metrics[0] || "temperature");
  const metric = data.spec.metrics.includes(selectedMetric) ? selectedMetric : data.spec.metrics[0] || "temperature";
  const [hidden, setHidden] = useState<string[]>([]);
  const [hour, setHour] = useState(12);
  const root = useRef<HTMLElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(810);
  const id = useId();
  const isTemperature = metric === "temperature";
  const unit = isTemperature ? "℃" : "%";
  const label = isTemperature ? "气温" : "降雨概率";
  const dates = [...new Set(data.spec.dates)];
  const series = dates.map((date, index) => {
    const candidates = data.points.filter(row => row.date === date);
    const counts = new Map<number, number>();
    for (const row of candidates) counts.set(row.hour, (counts.get(row.hour) || 0) + 1);
    const rows = candidates.filter(row => counts.get(row.hour) === 1 && usableValue(row, metric)).sort((a, b) => a.hour - b.hour);
    return { date, color: colors[index % colors.length], rows, visible: !hidden.includes(date) };
  });
  const visible = series.filter(item => item.visible);
  const values = visible.flatMap(item => item.rows.map(row => row[metric]));
  const low = isTemperature && values.length ? Math.floor((Math.min(...values) - 2) / 5) * 5 : 0;
  const high = isTemperature && values.length ? Math.max(low + 5, Math.ceil((Math.max(...values) + 2) / 5) * 5) : 100;
  const plotHeight = plotWidth < 500 ? 220 : 280;
  const bottom = plotHeight - 44;
  const right = plotWidth - 24;
  const x = (value: number) => 46 + value / 23 * (right - 46);
  const y = (value: number) => bottom - (value - low) / (high - low) * (bottom - 32);
  const tickStep = isTemperature ? [1, 2, 5, 10, 20, 50].find(step => step >= (high - low) / 5) || 50 : 25;
  const ticks = Array.from({ length: Math.floor((high - low) / tickStep) + 1 }, (_, index) => low + index * tickStep);
  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setPlotWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(".weather-series", { opacity: 0 }, { opacity: 1, duration: .35, ease: "power2.out" });
    });
    return () => media.revert();
  }, { scope: root, dependencies: [data, metric], revertOnUpdate: true });

  return <section ref={root} className="activity-comparison weather-comparison" aria-label="逐小时气温与降雨概率对比">
    <header className="weather-comparison-heading"><div><span className="section-kicker">天气对比 · 北京时间</span><h3>{data.cityName} <span>/ 逐小时环境</span></h3></div><div className="weather-metric-tabs" aria-label="对比指标">{data.spec.metrics.map(item => <button type="button" key={item} aria-pressed={metric === item} onClick={() => setMetric(item)}>{item === "temperature" ? "气温" : "降雨概率"}</button>)}</div></header>
    <div className="weather-date-cards" aria-label="选择对比日期">{series.map(item => {
      const numbers = item.rows.map(row => row[metric]);
      return <button type="button" key={item.date} aria-pressed={item.visible} onClick={() => setHidden(current => current.includes(item.date) ? current.filter(date => date !== item.date) : [...current, item.date])} style={{ "--series-color": item.color } as CSSProperties}>
        <span><i aria-hidden="true" />{item.date}<small>{item.visible ? "已显示" : "已隐藏"}</small></span>
        <strong>{numbers.length ? `${Math.min(...numbers).toFixed(1)} – ${Math.max(...numbers).toFixed(1)}` : "暂无数据"}<em>{numbers.length ? unit : ""}</em></strong>
        <small>{numbers.length ? `${numbers.length}/24 小时 · ${label}范围` : "未取得有效逐小时预报"}</small>
      </button>;
    })}</div>
    {data.missingDates.length > 0 && <p className="weather-data-notice" role="status">未取得 {data.missingDates.join("、")} 的数据，保留缺失，不使用其他日期替代。</p>}
    <div ref={plot} className="weather-plot">
    {values.length ? <figure className="weather-chart"><figcaption>{label} <span>({unit})</span><small>拖动下方滑块，查看同一时刻</small></figcaption>
      <svg role="img" aria-labelledby={`${id}-title ${id}-description`} viewBox={`0 0 ${plotWidth} ${plotHeight}`} onPointerMove={event => { const bounds = event.currentTarget.getBoundingClientRect(); const point = (event.clientX - bounds.left) / bounds.width * plotWidth; setHour(Math.max(0, Math.min(23, Math.round((point - 46) / (right - 46) * 23)))); }}>
        <title id={`${id}-title`}>{data.cityName} · {label}逐小时对比</title><desc id={`${id}-description`}>日期：{visible.map(item => item.date).join("、")}。横轴为北京时间 0 至 23 时，纵轴单位为{unit}。数据缺失处断开，可使用下方滑块读取数值。</desc>
        {ticks.map(value => <g key={value}><line x1="46" x2={right} y1={y(value)} y2={y(value)} stroke="#e4ebe6" strokeDasharray="3 5" /><text x="34" y={y(value) + 4} textAnchor="end">{value}</text></g>)}
        {[0, 6, 12, 18, 23].map(value => <text key={value} x={x(value)} y={plotHeight - 16} textAnchor="middle">{String(value).padStart(2, "0")}:00</text>)}
        <line x1={x(hour)} x2={x(hour)} y1="24" y2={bottom} stroke="#9aaea0" strokeDasharray="4 4" />
        {visible.map(item => <g className="weather-series" key={item.date}>{item.rows.map((row, index) => {
          const prior = item.rows[index - 1];
          return <g key={row.hour}>{prior && prior.hour === row.hour - 1 && <line x1={x(prior.hour)} x2={x(row.hour)} y1={y(prior[metric])} y2={y(row[metric])} stroke={item.color} strokeWidth="2.8" strokeLinecap="round" />}
            <circle cx={x(row.hour)} cy={y(row[metric])} r={row.hour === hour ? 5 : 2.5} fill={item.color} stroke="white" strokeWidth={row.hour === hour ? 2 : 0}><title>{item.date} {row.hour}:00 · {row[metric]}{unit}</title></circle></g>;
        })}</g>)}
      </svg>
    </figure> : <div className="weather-chart-empty" role="status">{visible.length ? "所选日期暂无有效数据，请稍后重试。" : "请选择至少一个日期，查看逐小时曲线。"}</div>}
    </div>
    <div className="weather-hour-control"><label htmlFor={`${id}-hour`}>逐小时读数 <strong>{String(hour).padStart(2, "0")}:00</strong></label><input id={`${id}-hour`} aria-label="查看小时" type="range" min="0" max="23" step="1" value={hour} onChange={event => setHour(Number(event.target.value))} /></div>
    <div className="weather-hour-values" aria-live="polite">{visible.map(item => { const row = item.rows.find(point => point.hour === hour); return <div key={item.date}><span><i style={{ background: item.color }} />{item.date}</span><strong>{row ? `${row[metric].toFixed(1)}${unit}` : "暂无数据"}</strong></div>; })}</div>
    <p className="weather-chart-note">仅展示有效预报；缺失、重复或异常小时不连线。预报会更新，出发前请再次核对。</p>
  </section>;
}
