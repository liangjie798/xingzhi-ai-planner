import type { TourismRoute } from "./types";

export interface TourismHourSnapshot {
  hour: number;
  temperature: number;
  humidity: number;
  rainProbability: number;
  aqi: number;
  heatRisk: number;
}

export interface TourismRequestPayload {
  cityName: string;
  province?: string;
  longitude?: number;
  latitude?: number;
  date: string;
  hours: TourismHourSnapshot[];
  /** 用户在「AI 模型配置」页保存的模型配置（OpenAI 兼容） */
  config?: { baseUrl: string; apiKey: string; model: string };
}

export async function fetchTourismRoute(apiBase: string, payload: TourismRequestPayload): Promise<TourismRoute> {
  const response = await fetch(`${apiBase}/tourism-planner`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let detail = `服务返回 ${response.status}`;
    try {
      const body = await response.json() as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch { /* keep default */ }
    throw new Error(detail);
  }
  return await response.json() as TourismRoute;
}
