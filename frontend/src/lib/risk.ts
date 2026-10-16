import { cityById } from "./cities";
import type {
  ActivityInput,
  DecisionResult,
  EvidenceItem,
  TimeSlotScore,
  ToolTraceItem,
} from "./types";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const groupFactor = {
  普通人群: 0,
  儿童青少年: 7,
  老年人: 12,
  敏感人群: 17,
} as const;

const intensityFactor = {
  低强度: 0,
  中强度: 6,
  高强度: 13,
} as const;

const hourlyOffset: Record<number, number> = {
  6: -5,
  7: -4,
  8: -2,
  9: 0,
  10: 2,
  11: 4,
  12: 6,
  13: 8,
  14: 9,
  15: 7,
  16: 4,
  17: 1,
  18: -2,
  19: -4,
  20: -5,
};

function levelOf(score: number): TimeSlotScore["level"] {
  if (score >= 72) return "适宜";
  if (score >= 48) return "谨慎";
  return "不建议";
}

export function buildTimeSlots(input: ActivityInput): TimeSlotScore[] {
  const city = cityById(input.cityId);
  const hours = Array.from({ length: 15 }, (_, index) => index + 6);

  return hours.map((hour) => {
    const offset = hourlyOffset[hour] ?? 0;
    const temperature = Math.round((city.temperature + offset * 0.45) * 10) / 10;
    const heatRisk = clamp(city.heatRisk + offset * 2.2 + intensityFactor[input.intensity]);
    const aqi = Math.round(clamp(city.aqi + Math.sin(hour * 0.9) * 9, 18, 180));
    const rainProbability = Math.round(clamp(city.rainProbability + Math.cos(hour * 0.65) * 8));
    const risk =
      heatRisk * 0.42 +
      clamp((aqi - 35) * 0.75) * 0.28 +
      rainProbability * 0.18 +
      groupFactor[input.group] +
      Math.max(0, input.duration - 2) * 4;
    const score = Math.round(clamp(100 - risk));

    return {
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      temperature,
      aqi,
      heatRisk: Math.round(heatRisk),
      rainProbability,
      score,
      level: levelOf(score),
    };
  });
}

export const evidenceLibrary: EvidenceItem[] = [
  {
    title: "环境空气质量指数（AQI）技术规定",
    publisher: "生态环境主管部门",
    excerpt: "活动建议应结合AQI等级、主要污染物与敏感人群特征，不以单一污染物替代综合判断。",
    tag: "空气质量",
  },
  {
    title: "高温天气公众健康防护提示",
    publisher: "气象与健康主管部门",
    excerpt: "高温时段应减少长时间、高强度户外活动，优先调整至早晚并补充饮水与遮阴。",
    tag: "高温防护",
  },
  {
    title: "学校体育活动安全管理要点",
    publisher: "教育主管部门公开资料",
    excerpt: "学校体育活动需要结合天气、场地和学生身体状况制定调整及应急预案。",
    tag: "校园活动",
  },
];

export function createDeterministicDecision(input: ActivityInput): DecisionResult {
  const city = cityById(input.cityId);
  const slots = buildTimeSlots(input);
  const bestSlot = [...slots].sort((a, b) => b.score - a.score)[0];
  const selected = slots.find((slot) => slot.hour === input.startHour) ?? bestSlot;
  const isChanged = bestSlot.hour !== input.startHour;
  const recommendation = isChanged
    ? `建议将${input.activityType}调整至 ${bestSlot.label} 开始`
    : `${selected.label} 可作为当前优先时段`;

  const actions = [
    bestSlot.heatRisk >= 58 ? "设置补水点与遮阴休息区，每30分钟安排一次休息" : "保留常规补水与休息安排",
    bestSlot.aqi >= 80 ? "减少持续耐力项目，并关注敏感参与者状态" : "空气条件允许开展常规户外项目",
    bestSlot.rainProbability >= 40 ? "提前确认室内场地并设置降雨触发条件" : "保留场地防滑与短时降雨检查",
  ];

  const trace: ToolTraceItem[] = [
    { id: "t1", name: "get_environment_snapshot", detail: `读取${city.name}环境快照`, status: "fallback", durationMs: 0 },
    { id: "t2", name: "retrieve_policy_evidence", detail: "检索空气、高温与校园活动依据", status: "done", durationMs: 0 },
    { id: "t3", name: "calculate_activity_risk", detail: "计算15个候选时段的复合风险", status: "done", durationMs: 0 },
    { id: "t4", name: "compare_candidate_slots", detail: `选择${bestSlot.label}为综合最优时段`, status: "done", durationMs: 0 },
  ];

  return {
    recommendation,
    summary: `${city.name}${city.weather}。综合温湿度、AQI、降水概率、${input.group}和${input.intensity}活动约束，${bestSlot.label}的活动适宜度最高。当前结果使用可复现的演示数据，接入正式数据源后将保留同一计算与证据链。`,
    overallScore: bestSlot.score,
    overallLevel: bestSlot.level,
    bestSlot,
    slots,
    actions,
    contingency: `当AQI超过100、热风险进入高等级或降水概率超过60%时，建议将活动转入室内；若无法转场，则缩短至${Math.max(1, input.duration - 1)}小时并降低运动强度。`,
    evidence: evidenceLibrary,
    trace,
    generatedBy: "deterministic-fallback",
  };
}

