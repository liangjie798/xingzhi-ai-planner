import type { ActivityInput, DecisionResult, TourismRoute } from "./types";

export type AgentAction = "explain" | "compare" | "checklist";
export function detectAgentAction(message: string): AgentAction | null {
  if (/改成|调整为|换成|重新规划|改到/.test(message)) return null;
  if (/清单|准备什么|带什么|筹备/.test(message)) return "checklist";
  if (/比较|对比|候选/.test(message)) return "compare";
  if (/为什么|解释|依据|原因/.test(message)) return "explain";
  return null;
}

export function answerAgentAction(action: AgentAction, input: ActivityInput, result: DecisionResult | null, route: TourismRoute | null): string {
  if (!result && !route) return "请先告诉我城市、日期和活动需求，完成分析后，我可以比较候选时段、解释推荐依据，并给出筹备清单。";
  if (action === "checklist") return [
    `${route ? "出行" : input.activityType}筹备清单：`,
    "□ 确认日期、人员名单、负责人和紧急联系人。",
    route ? "□ 核实每个景点的预约、营业时间、餐饮与交通。" : `□ 为 ${input.participants} 人确认分组、医疗、补水与秩序岗位。`,
    "□ 准备饮水、雨具、急救与通讯用品。",
    "□ 出发或开场前复核天气、空气质量与当地预警。",
    ...(result ? result.actions.map((action) => `□ ${action}。`) : []),
    "□ 确认转场或延期条件，结束后清点人员。",
  ].join("\n");
  if (action === "compare") {
    if (!result) return `本次为 ${route!.dayCount} 日旅行规划，共 ${route!.stops.length} 个停靠点。推荐出行时段：${route!.bestHours}。当前路线结果不包含各时段独立评分，不能据此给出精确分差；如需比较活动时段，请在对话中说明活动类型后重新分析。`;
    const slots = [...result.slots].sort((a, b) => b.score - a.score).slice(0, 3);
    return "按本轮实际评分，前三个候选时段为：\n" + slots.map((slot, index) => `${index + 1}. ${slot.date || input.date} ${slot.label}：${slot.score} 分（${slot.level}），气温 ${slot.temperature}℃，US AQI ${slot.aqi}，降雨概率 ${slot.rainProbability}%。`).join("\n") + "\n评分同时考虑活动强度与参与人群，临近执行时仍需复核。";
  }
  if (result) return `${result.recommendation}。\n${result.summary}\n推荐时段的气温为 ${result.bestSlot.temperature}℃，US AQI 为 ${result.bestSlot.aqi}，降雨概率为 ${result.bestSlot.rainProbability}%，综合适宜度 ${result.bestSlot.score} 分。\n本轮引用依据：${result.evidence.slice(0, 3).map((item) => item.title).join("；")}。\n备用安排：${result.contingency}`;
  return `${route!.summary}\n推荐出行时段：${route!.bestHours}。规划结合城市候选景点、餐饮与逐小时环境；平台按钮为关键词检索入口，不代表实时热度排名。\n${route!.notes.join("\n")}`;
}
