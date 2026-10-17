"use client";

import { ArrowLeft, CalendarBlank, CaretDown, CloudSun, Compass, Drop, Gauge, MapPin, ThermometerSimple, WarningCircle, Wind } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cities, cityById, readSelectedCity, saveSelectedCity } from "@/lib/cities";
import type { CityOption } from "@/lib/cities";
import { comfortLevel, comfortScore } from "@/lib/comfort";
import type { CityEnvironment, EnvironmentalForecastPoint } from "@/lib/types";

function dateString(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

interface HourRow {
  point: EnvironmentalForecastPoint;
  score: number;
  level: "适宜" | "谨慎" | "不建议";
}

export default function HourlyPage() {
  const [cityOption, setCityOption] = useState<CityOption>(() => cities[4]);
  const [dateRange, setDateRange] = useState({ min: "", max: "" });
  const [date, setDate] = useState("");
  const [citySnapshot, setCitySnapshot] = useState<CityEnvironment | null>(null);
  const [hours, setHours] = useState<HourRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const selected = readSelectedCity() as CityOption;
      setCityOption(selected);
      setDate(dateString());
      setDateRange({ min: dateString(), max: dateString(4) });
    });
  }, []);

  const loadData = useCallback(async (targetCity: CityOption, targetDate: string) => {
    if (!targetDate) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        cityId: targetCity.id,
        date: targetDate,
        name: targetCity.name,
        province: targetCity.province,
        adcode: targetCity.adcode,
        longitude: String(targetCity.center[0]),
        latitude: String(targetCity.center[1]),
      });
      const response = await fetch(`/api/v1/cities/hourly?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        let detail = `服务返回 ${response.status}`;
        try {
          const body = await response.json() as { detail?: string };
          if (body.detail) detail = body.detail;
        } catch { /* keep default */ }
        throw new Error(detail);
      }
      const data = await response.json() as { city: CityEnvironment; hours: EnvironmentalForecastPoint[] };
      setCitySnapshot(data.city);
      setHours(data.hours.map((point) => ({
        point,
        score: comfortScore(point),
        level: comfortLevel(comfortScore(point)),
      })));
    } catch (caught) {
      setCitySnapshot(null);
      setHours([]);
      setError(caught instanceof Error ? caught.message : "逐小时数据加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadData(cityOption, date));
  }, [cityOption, date, loadData]);

  const selectedCity = cityOption;
  const bestHours = useMemo(
    () => hours.slice().sort((a, b) => b.score - a.score).slice(0, 4).map((row) => row.point.hour),
    [hours],
  );

  return (
    <main className="subpage-shell">
      <header className="subpage-topbar">
        <Link href="/dashboard" className="subpage-back"><ArrowLeft size={16} /> 返回工作台</Link>
        <div className="subpage-brand"><Compass size={20} weight="duotone" /><strong>适候 · 逐小时环境数据</strong></div>
        <div className="subpage-controls">
          <div className="select-wrap compact"><MapPin size={16} />
            <select aria-label="选择城市" value={cities.some((city) => city.id === cityOption.id) ? cityOption.id : ""} onChange={(event) => { const next = cityById(event.target.value); setCityOption(next); saveSelectedCity(next); }}>
              {cities.some((city) => city.id === cityOption.id) ? null : <option value="">{cityOption.name}（搜索城市）</option>}
              {cities.map((city) => <option value={city.id} key={city.id}>{city.name} · {city.province}</option>)}
            </select>
            <CaretDown size={13} />
          </div>
          <div className="input-wrap compact"><CalendarBlank size={16} />
            <input aria-label="选择日期" type="date" min={dateRange.min} max={dateRange.max} value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
        </div>
      </header>

      <section className="subpage-body">
        <div className="subpage-heading">
          <div>
            <span className="section-kicker">{selectedCity.province} · {selectedCity.adcode}</span>
            <h1>{selectedCity.name}逐小时环境预报</h1>
          </div>
          {citySnapshot && (
            <div className="city-metrics" aria-label="当前实况">
              <Metric icon={ThermometerSimple} value={`${citySnapshot.temperature}°`} label="气温" />
              <Metric icon={Drop} value={`${citySnapshot.humidity}%`} label="湿度" />
              <Metric icon={Wind} value={`${citySnapshot.aqi}`} label="US AQI" />
              <Metric icon={CloudSun} value={`${citySnapshot.heatRisk}`} label="热风险" />
            </div>
          )}
        </div>

        {error && <div className="error-notice" role="alert"><WarningCircle size={17} /><span>{error}</span></div>}
        {isLoading && <div className="hourly-loading"><span className="button-loader dark" /><p>正在读取逐小时预报…</p></div>}

        {!isLoading && hours.length > 0 && (
          <>
            <div className="hourly-summary">
              <strong>最佳活动时段：</strong>
              {bestHours.map((hour) => `${String(hour).padStart(2, "0")}:00`).join(" · ")}
              <span className="hourly-hint">（按适宜度得分排序，点击下方时段列可查看详情）</span>
            </div>

            <div className="hour-grid" role="list">
              {hours.map((row) => (
                <div className={`hour-cell level-${row.level} ${bestHours.includes(row.point.hour) ? "is-best" : ""}`} role="listitem" key={row.point.hour}>
                  <span className="hour-label">{String(row.point.hour).padStart(2, "0")}:00</span>
                  <span className="hour-score">{row.score}</span>
                  <span className="hour-bar-wrap"><span className="hour-bar" style={{ height: `${Math.max(14, row.score)}%` }} /></span>
                  <span className="hour-temp">{row.point.temperature}°</span>
                  <span className="hour-level">{row.level}</span>
                  <dl className="hour-detail">
                    <div><dt>湿度</dt><dd>{row.point.humidity}%</dd></div>
                    <div><dt>降水</dt><dd>{row.point.rainProbability}%</dd></div>
                    <div><dt>AQI</dt><dd>{row.point.aqi}</dd></div>
                    <div><dt>热风险</dt><dd>{row.point.heatRisk}</dd></div>
                  </dl>
                </div>
              ))}
            </div>

            <table className="hour-table">
              <thead>
                <tr><th>时间</th><th>气温</th><th>湿度</th><th>降水概率</th><th>US AQI</th><th>热风险</th><th>适宜度</th></tr>
              </thead>
              <tbody>
                {hours.map((row) => (
                  <tr key={row.point.hour} className={bestHours.includes(row.point.hour) ? "is-best" : ""}>
                    <td>{String(row.point.hour).padStart(2, "0")}:00</td>
                    <td>{row.point.temperature}°C</td>
                    <td>{row.point.humidity}%</td>
                    <td>{row.point.rainProbability}%</td>
                    <td>{row.point.aqi}</td>
                    <td>{row.point.heatRisk}</td>
                    <td><span className={`comfort-chip level-${row.level}`}>{row.level} {row.score}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="data-note standalone"><Wind size={18} /><span>天气与降雨来自 Open-Meteo 逐小时预报；空气质量为 Open-Meteo US AQI 模型数据；适宜度 = 100 − 热风险×0.42 − AQI 超标惩罚 − 降雨惩罚，与前端工作台口径一致。数据为城市坐标附近网格预报。</span></p>
          </>
        )}
      </section>
    </main>
  );
}

function Metric({ icon: Icon, value, label }: { icon: typeof Gauge; value: string; label: string }) {
  return (
    <div className="metric-item">
      <Icon size={18} />
      <div><strong>{value}</strong><span>{label}</span></div>
    </div>
  );
}
