export type LayerKey = "comfort" | "temperature" | "humidity" | "aqi" | "heat";

export type ActivityType = "校园运动会" | "体育课" | "社区活动" | "户外训练" | "研学活动";
export type Intensity = "低强度" | "中强度" | "高强度";
export type GroupType = "普通人群" | "儿童青少年" | "老年人" | "敏感人群";

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
  sourceMode: "live" | "demo";
}

export interface ActivityInput {
  cityId: string;
  activityType: ActivityType;
  date: string;
  startHour: number;
  duration: number;
  participants: number;
  intensity: Intensity;
  group: GroupType;
  locationName: string;
}

export interface TimeSlotScore {
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
  title: string;
  publisher: string;
  excerpt: string;
  tag: string;
}

export interface ToolTraceItem {
  id: string;
  name: string;
  detail: string;
  status: "done" | "fallback";
  durationMs: number;
}

export interface DecisionResult {
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
  generatedBy: "deepseek" | "deterministic-fallback";
}

