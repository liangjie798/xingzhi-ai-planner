import type { SocialResearch } from "./social-research";
export type LayerKey = "comfort" | "temperature" | "humidity" | "aqi" | "heat";

export type ActivityType = "校园运动会" | "体育课" | "社区活动" | "户外训练" | "研学活动" | "旅游规划";
export type Intensity = "低强度" | "中强度" | "高强度";
export type GroupType = "普通人群" | "儿童青少年" | "老年人" | "敏感人群" | "外来旅游人群";

export interface CityEnvironment {
  id: string;
  name: string;
  province: string;
  adcode: string;
  center: [number, number];
  weather: string;
  temperature: number;
  humidity: number;
  windPower: number;
  rainProbability: number;
  aqi: number;
  pm25: number;
  heatRisk: number;
  updatedAt: string;
  sourceMode: "live";
}

export interface ActivityInput {
  cityId: string;
  activityType: ActivityType;
  date: string;
  endDate?: string;
  startHour: number;
  duration: number;
  participants: number;
  intensity: Intensity;
  group: GroupType;
  locationName: string;
  cityName?: string;
  province?: string;
  adcode?: string;
  longitude?: number;
  latitude?: number;
  siteObservation?: string;
  referenceUrls?: string[];
  allowedStartHour?: number;
  allowedEndHour?: number;
}

export interface CitySearchResult {
  id: string;
  name: string;
  province: string;
  district: string;
  adcode: string;
  longitude: number;
  latitude: number;
}

export interface EnvironmentalForecastPoint {
  date?: string;
  hour: number;
  temperature: number;
  humidity: number;
  rainProbability: number;
  aqi: number;
  pm25: number;
  heatRisk: number;
}

export interface HourlyEnvironmentResponse {
  city: CityEnvironment;
  date: string;
  hours: EnvironmentalForecastPoint[];
}

export interface TimeSlotScore {
  date?: string;
  hour: number;
  label: string;
  temperature: number;
  aqi: number;
  heatRisk: number;
  rainProbability: number;
  score: number;
  level: "适宜" | "谨慎" | "不建议";
}

export interface EvidenceItem {
  relatedPlaces?: string[];
  verification?: string;
  retrievedAt?: string;
  id?: string;
  title: string;
  publisher: string;
  excerpt: string;
  tag: string;
  sourceUrl?: string;
  publishedAt?: string;
  section?: string;
  retrievalScore?: number;
}

export interface ToolTraceItem {
  id: string;
  name: string;
  detail: string;
  status: "done" | "fallback";
  durationMs: number;
}

export interface DecisionResult {
  venues?: ActivityVenue[];
  venueNotice?: string;
  socialResearch?: SocialResearch;
  totalDurationMs?: number;
  recommendation: string;
  summary: string;
  overallScore: number;
  overallLevel: "适宜" | "谨慎" | "不建议";
  bestSlot: TimeSlotScore;
  slots: TimeSlotScore[];
  actions: string[];
  contingency: string;
  evidence: EvidenceItem[];
  trace: ToolTraceItem[];
  generatedBy: "deepseek-agent" | "open-model-agent" | "deterministic-agent-fallback" | "validated-safety-fallback";
  modelProvider: string;
  confidence: number;
  ragMode: string;
  agentPlan: string[];
}

export interface ActivityVenue {
  id: string;
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  indoor: boolean;
  reason: string;
  task: string;
  checks: string;
}

export interface GridPoint {
  longitude: number;
  latitude: number;
  temperature: number;
  humidity: number;
  aqi: number;
  heatRisk: number;
  rainProbability: number;
  comfort: number;
}

export interface MapLegendInfo {
  label: string;
  min: number;
  max: number;
  unit: string;
  highIsBad: boolean;
}

export interface TourismStop {
  name: string;
  longitude: number | null;
  latitude: number | null;
  time: string;
  tip: string;
  tag: string;
  category: "景点" | "美食";
  day: number;
  date: string;
  address?: string;
  imageUrl?: string;
  articleTitle?: string;
  articleUrl?: string;
  links: Array<{
    label: string;
    url: string;
    kind: "douyin" | "xiaohongshu" | "map" | "source";
  }>;
}

export interface TourismRoute {
  socialResearch?: SocialResearch;
  totalDurationMs?: number;
  cityName: string;
  date: string;
  endDate: string;
  dayCount: number;
  summary: string;
  bestHours: string;
  stops: TourismStop[];
  notes: string[];
  generatedBy: "llm" | "curated";
  provider?: string;
  evidence: EvidenceItem[];
  trace: ToolTraceItem[];
}

export interface ModelConfig {
  providerId: string;
  providerLabel: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

