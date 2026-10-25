import type { ActivityInput, DecisionResult, ActivityType } from "./types";

export interface AgendaItem { time: string; title: string; action: string; owner: string; reference?: { title: string; url: string; excerpt: string } }
const stages: Record<Exclude<ActivityType, "旅游规划">, string[]> = {
  "校园运动会": ["热身与规则确认", "分组检录与项目轮换", "分批竞赛与成绩登记", "决赛或协作项目", "整理放松与成绩核对"],
  "体育课": ["集合点名与动态热身", "动作示范与分组练习", "技术练习与个别指导", "应用练习与小组展示", "整理放松与课堂评价"],
  "社区活动": ["签到导入与规则说明", "分区体验与低强度互动", "小组协作与交流", "成果展示与互动反馈", "放松整理与人员确认"],
  "户外训练": ["动态热身与负荷确认", "基础动作与技术训练", "分组主训练与状态记录", "低负荷巩固与复练", "拉伸恢复与训练反馈"],
  "研学活动": ["集合清点与任务发布", "主题观察与资料记录", "分组探究与导师答疑", "成果整理与小组分享", "总结回顾与返程清点"],
};
function time(date: string, minute: number) {
  const offset = Math.floor(minute / 1440);
  const clock = ((minute % 1440) + 1440) % 1440;
  const prefix = offset ? new Date(Date.parse(date) + offset * 86400000).toISOString().slice(5, 10) + " " : "";
  return `${prefix}${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}`;
}
export function activityAgenda(input: ActivityInput, result: DecisionResult, date: string): AgendaItem[] {
  const daily = result.slots.filter((slot) => (slot.date || input.date) === date).sort((a, b) => b.score - a.score);
  const requested = input.startHour ?? result.bestSlot.hour;
  const periodStart = input.allowedStartHour ?? 6;
  const periodEnd = input.allowedEndHour ?? 21;
  const feasible = daily.filter((slot) => slot.hour >= periodStart && slot.hour + input.duration <= periodEnd);
  const start = (feasible[0]?.hour ?? Math.max(periodStart, Math.min(requested, periodEnd - input.duration))) * 60;
  const duration = Math.max(1, Math.min(12, input.duration)) * 60;
  const title = stages[input.activityType === "旅游规划" ? "研学活动" : input.activityType];
  const items: AgendaItem[] = [
    { time: `${time(date, start - 60)}–${time(date, start - 30)}`, title: "场地与数据复核", action: "核对当日预报、空气质量和预警；检查通道、饮水、急救用品及备用场地。触发备用条件时先通知调整，再组织到场。", owner: "总协调 / 环境观察岗" },
    { time: `${time(date, start - 30)}–${time(date, start)}`, title: "签到分组与岗位确认", action: `核对${input.participants}名参与者，登记特殊需求；按${input.group}的情况分组，说明集合点、联络方式和退出流程。`, owner: "签到 / 各组负责人" },
  ];
  // Divide the full session into five phases; insert a break at least every 35 minutes.
  for (let phase = 0; phase < 5; phase++) {
    const from = Math.round(duration * phase / 5);
    const until = Math.round(duration * (phase + 1) / 5);
    let cursor = from;
    while (cursor < until) {
      const end = Math.min(cursor + 35, until);
      const breakLength = end - cursor > 15 && (phase > 0 && phase < 4 || end < until) ? 5 : 0;
      items.push({ time: `${time(date, start + cursor)}–${time(date, start + end - breakLength)}`, title: title[phase], action: `${result.actions[phase % Math.max(1, result.actions.length)] || "按分组任务组织活动，记录参与者状态。"}；${input.intensity}执行，负责人观察疲劳、不适与场地变化，必要时降低负荷或提前退出。`, owner: input.activityType === "体育课" ? "任课教师 / 组长" : input.activityType === "研学活动" ? "带队教师 / 导师" : "项目负责人 / 各组长" });
      const source = result.socialResearch?.items[0];
      if (phase === 1 && cursor === from && source) items.at(-1)!.reference = { title: source.title, url: source.url, excerpt: source.excerpt };
      if (breakLength) items.push({ time: `${time(date, start + end - breakLength)}–${time(date, start + end)}`, title: "补水与状态复查", action: "停止连续活动，安排补水和短暂休息；询问不适，确认各组人数。发现异常由医疗联络岗接手。", owner: "各组负责人 / 医疗联络岗" });
      cursor = end;
    }
  }
  items.push({ time: `${time(date, start + duration)}–${time(date, start + duration + 15)}`, title: "收尾与离场清点", action: "回收物资、清理场地、核对离场人数与接送安排；登记异常、完成交接并汇总复盘。", owner: "总协调 / 秩序岗" });
  return items;
}

export function activityDates(input: ActivityInput) {
  const dates: string[] = [];
  const last = input.endDate || input.date;
  for (let date = input.date; date && date <= last && dates.length < 7; date = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10)) dates.push(date);
  return dates;
}
