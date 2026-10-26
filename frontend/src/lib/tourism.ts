import type { TourismRoute, GroupType, Intensity } from "./types";
import { enrichRouteEvidence } from "./place-evidence-client";

export interface TourismHourSnapshot {
  date: string;
  hour: number;
  temperature: number;
  humidity: number;
  rainProbability: number;
  aqi: number;
  heatRisk: number;
}

export interface TourismRequestPayload {
  audienceDescription?: string;
  budgetPerPerson?: number;
  cityName: string;
  province?: string;
  longitude?: number;
  latitude?: number;
  date: string;
  endDate: string;
  hours: TourismHourSnapshot[];
  participants?: number;
  group?: GroupType;
  intensity?: Intensity;
  referenceUrls?: string[];
  allowedStartHour?: number;
  allowedEndHour?: number;
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
  return enrichRouteEvidence(await response.json() as TourismRoute);
}
