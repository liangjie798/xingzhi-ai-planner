"use client";

import { useEffect, useMemo, useState } from "react";
import { EnvironmentMap, type MapSelection } from "./environment-map";
import type { NationalEnvironment } from "@/lib/national-environment";
import type { CityEnvironment, LayerKey } from "@/lib/types";

const center: [number, number] = [104, 35];
export function NationalEnvironmentMap({ layer, onPointSelected }: { layer: LayerKey; onPointSelected: (location: MapSelection) => void }) {
  const [data, setData] = useState<NationalEnvironment | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/national-environment", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("全国环境数据暂不可用，可重试或在对话中指定城市。");
      const result = await response.json() as NationalEnvironment;
      setData(result); setError("");
    }).catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "全国环境数据暂不可用"); });
    return () => controller.abort();
  }, [attempt]);
  const sampledAdcodes = useMemo(() => data?.samples.map((point) => point.adcode) ?? [], [data]);
  // This anchor has no center marker or displayed weather summary.
  const anchor = useMemo<CityEnvironment>(() => ({ id: "national", name: "全国", province: "中国", adcode: "100000", center, weather: "", temperature: 0, humidity: 0, windPower: 0, rainProbability: 0, aqi: 0, pm25: 0, heatRisk: 0, updatedAt: data?.retrievedAt ?? "", sourceMode: "live" }), [data]);
  return <div className="national-environment">
    <div className="national-map-status" role="status"><span>{data ? `${data.source} · ${data.samples.length}/${data.expected} 个地区可用 · 更新 ${new Date(data.retrievedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" })}` : error || "正在获取全国代表地点的真实环境数据…"}</span>{error && <button type="button" onClick={() => setAttempt((value) => value + 1)}>重试</button>}</div>
    <EnvironmentMap city={anchor} layer={layer} grid={data?.samples} national sampledAdcodes={sampledAdcodes} onPointSelected={onPointSelected} />
    <p className="national-map-note">颜色为各省级代表地点的当前环境采样插值，按行政边界裁切，不代表全省每个位置的实测值。灰色区域为缺测；在对话中指定城市后可查看当地详细数据。</p>
    {data && <section className="national-samples" aria-label="全国代表地点数据"><h3>全国环境采样概览</h3><div className="national-sample-list">{data.samples.map((point) => <article key={point.adcode}><strong>{point.name}</strong><span>{point.temperature}℃ · 湿度 {point.humidity}%</span><small>US AQI {point.aqi} · 适宜度 {point.comfort}分</small></article>)}</div></section>}
  </div>;
}
