import type { ActivityInput, DecisionResult, TimeSlotScore } from "./types";

export const isScoreQuestion = (text: string) => /评分|分数|分差|得分|适宜度/.test(text) && /为什么|为何|原因|解释|差|更高|更低|比较|对比/.test(text);
/** Same terms and clamp order as RiskCalculator; use persisted slot metrics, not a web search. */
export function scoreContributions(slot: TimeSlotScore, input: ActivityInput) {
  const group: Record<string, number> = { 普通人群: 0, 儿童青少年: 7, 老年人: 12, 敏感人群: 17 };
  const activity: Record<string, number> = { 校园运动会: 7, 体育课: 3, 社区活动: 1, 户外训练: 10, 研学活动: 4, 旅游规划: 2 };
  return { 热风险: slot.heatRisk * .42, 空气质量: Math.min(100, Math.max(0, (slot.aqi - 35) * .75)) * .28, 降雨: slot.rainProbability * .18, 人群: group[input.group] ?? 7, 活动: activity[input.activityType] ?? 3, 时长: Math.max(0, input.duration - 1) * 4 };
}
export function explainScoreDifference(message: string, input: ActivityInput, result: DecisionResult | null): string {
  if (!result?.slots.length) return "当前对话还没有活动评分结果。请先完成活动分析，我会依据本轮实际评分解释分差。";
  const dates = [...message.matchAll(/(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})[日号]?/g)].map(match => `${match[1] || input.date.slice(0, 4)}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`);
  if (!dates.length) dates.push(...new Set(result.slots.map(slot => slot.date || input.date)));
  const range = /下午/.test(message) ? [12, 18] : /上午/.test(message) ? [6, 12] : /晚上/.test(message) ? [18, 21] : [6, 21];
  const hour = message.match(/(\d{1,2})[点时]/);
  const selected = dates.slice(0, 2).map(date => result.slots.filter(slot => (slot.date || input.date) === date && slot.hour >= range[0] && slot.hour + input.duration <= range[1] && (!hour || slot.hour === Number(hour[1]))).sort((a, b) => b.score - a.score || a.hour - b.hour)[0]);
  if (selected.some(slot => !slot)) return `本轮没有这些日期和时段的完整${input.duration}小时评分，无法解释对应分差。已有评分日期：${[...new Set(result.slots.map(slot => slot.date || input.date))].join("、")}。请调整查询时段，或修改活动日期后重新分析。`;
  const rows = selected as TimeSlotScore[];
  const lines = rows.map(slot => {
    const parts = scoreContributions(slot, input);
    const calculated = Math.round(Math.max(0, Math.min(100, 100 - Object.values(parts).reduce((sum, value) => sum + value, 0))));
    return `${slot.date || input.date} ${slot.hour}:00–${slot.hour + input.duration}:00：${slot.score}分；平均气温${slot.temperature}℃，最高降雨概率${slot.rainProbability}%，最高US AQI ${slot.aqi}，强度修正后热风险${slot.heatRisk}。\n扣分：${Object.entries(parts).map(([key, value]) => `${key}${value.toFixed(2)}`).join("、")}。${calculated === slot.score ? "从100分扣除上述项目，限制在0–100后四舍五入。" : "该历史结果与当前公式不一致，请重新分析；不将当前公式冒充历史评分依据。"}`;
  });
  const comparison = rows.length === 2 ? `按本轮数据，${dates[0]}比${dates[1]}${rows[0].score === rows[1].score ? "同分" : `${rows[0].score > rows[1].score ? "高" : "低"}${Math.abs(rows[0].score - rows[1].score)}分`}。以实际评分为准。\n` : "";
  return comparison + "未指定具体开始时间时，比较各日期所选时段中评分最高的完整窗口：\n" + lines.join("\n\n") + "\n同一活动下，人群、活动类型和时长扣分相同；环境项的变化造成分差，气温没有单独重复扣分。";
}
