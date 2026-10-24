import type { ActivityInput } from "./types";

export type IntakePatch = Partial<Pick<ActivityInput, "cityName" | "activityType" | "date" | "endDate" | "startHour" | "duration" | "participants" | "intensity" | "group" | "referenceUrls">> & { tripDays?: number };
export interface IntakeState { known: IntakePatch }
const activities = ["校园运动会", "体育课", "社区活动", "户外训练", "研学活动", "旅游规划"] as const;
const numbers: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function number(text: string) {
  if (/^\d+$/.test(text)) return Number(text);
  let total = 0, digit = 0;
  for (const character of text) {
    const unit = ({ 十: 10, 百: 100, 千: 1000 } as Record<string, number>)[character];
    if (unit) { total += (digit || 1) * unit; digit = 0; }
    else digit = numbers[character] ?? 0;
  }
  return total + digit;
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00+08:00`) + days * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function cleanIntake(raw: IntakePatch = {}): IntakePatch {
  const out: IntakePatch = {};
  if (Array.isArray(raw.referenceUrls)) out.referenceUrls = raw.referenceUrls.filter((url) => typeof url === "string" && /^https:\/\/(?:[a-z0-9-]+\.)*(?:douyin|xiaohongshu)\.com\//i.test(url)).slice(0, 4);
  if (typeof raw.cityName === "string" && raw.cityName.trim()) out.cityName = raw.cityName.trim().slice(0, 40);
  if (activities.includes(raw.activityType!)) out.activityType = raw.activityType;
  if (validDate(raw.date)) out.date = raw.date;
  if (validDate(raw.endDate)) out.endDate = raw.endDate;
  if (["低强度", "中强度", "高强度"].includes(raw.intensity!)) out.intensity = raw.intensity;
  if (["普通人群", "儿童青少年", "老年人", "敏感人群", "外来旅游人群"].includes(raw.group!)) out.group = raw.group;
  for (const [key, min, max] of [["startHour", 0, 23], ["duration", 1, 12], ["participants", 1, 9999], ["tripDays", 1, 7]] as const) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max) out[key] = Math.round(value);
  }
  return out;
}

/** Explicit facts only: the dashboard's initial Hangzhou/date/500 students are not answers. */
export function extractIntake(text: string, today: string, known: IntakePatch): IntakePatch {
  const patch: IntakePatch = {};
  const links = text.match(/https:\/\/(?:[a-z0-9-]+\.)*(?:douyin|xiaohongshu)\.com\/[^\s，。；<>]+/gi);
  if (links) patch.referenceUrls = [...new Set([...(known.referenceUrls || []), ...links])].slice(0, 4);
  patch.activityType = activities.find((item) => text.includes(item)) || (/运动会/.test(text) ? "校园运动会" : /旅游|旅行|行程|游玩|游览/.test(text) ? "旅游规划" : undefined);
  const days = text.match(/([一二两三四五六七八九十\d]+)\s*(?:天|日)(?!期)/);
  if (days) patch.tripDays = number(days[1]);
  const duration = text.match(/([一二两三四五六七八九十\d]+)\s*个?小时/);
  if (duration) patch.duration = number(duration[1]);
  const people = text.match(/([零〇一二两三四五六七八九十百千\d]+)\s*(?:个|位|名)?\s*(?:大学生|研究生|成年人|成人|初中生|高中生|小学生|学生|同学|小朋友|孩子|老人|老年人|人|位|名)/)
    || (known.activityType && !known.participants ? text.match(/^\s*([零〇一二两三四五六七八九十百千\d]+)\s*个?[。！]?\s*$/) : null);
  if (people) patch.participants = number(people[1]);
  if (/大学生|研究生|成年人|成人/.test(text)) patch.group = "普通人群";
  else if (/儿童|学生|初中生|高中生|亲子|孩子|青少年/.test(text)) patch.group = "儿童青少年";
  else if (/老人|老年|长者/.test(text)) patch.group = "老年人";
  else if (/敏感人群/.test(text)) patch.group = "敏感人群";
  else if (/成人|成年|普通人群|年轻人/.test(text)) patch.group = "普通人群";
  patch.intensity = /低强度|轻松|轻量/.test(text) ? "低强度" : /高强度|高负荷/.test(text) ? "高强度" : /中强度|适中/.test(text) ? "中强度" : undefined;
  const dates = [...text.matchAll(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})日?/g)].map((m) => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`);
  if (dates[0]) patch.date = dates[0];
  else {
    const relative = /大后天/.test(text) ? 3 : /后天/.test(text) ? 2 : /明天/.test(text) ? 1 : /今天|今日|未来/.test(text) ? 0 : null;
    if (relative !== null) patch.date = addDays(today, relative);
    const monthDay = text.match(/(\d{1,2})月(\d{1,2})[日号]?/);
    if (monthDay) patch.date = `${today.slice(0, 4)}-${monthDay[1].padStart(2, "0")}-${monthDay[2].padStart(2, "0")}`;
  }
  if (dates[1]) patch.endDate = dates[1];
  const hour = text.match(/(?:早上|上午|下午|晚上|中午)?\s*(\d{1,2})(?:点|时|:00)/);
  if (hour) patch.startHour = Number(hour[1]) + (/下午|晚上/.test(text) && Number(hour[1]) < 12 ? 12 : 0);
  else if (/下午/.test(text)) patch.startHour = 14;
  else if (/早上|上午/.test(text)) patch.startHour = 9;
  else if (/晚上/.test(text)) patch.startHour = 19;
  const common = text.match(/北京|上海|广州|深圳|杭州|成都|武汉|南京|西安|香港|澳门|重庆|天津/);
  const named = text.match(/(?:去|在|到|目的地[是为：:]?|城市[是为：:]?)\s*([\u4e00-\u9fa5]{2,8}?[市县区])/) || text.match(/^([\u4e00-\u9fa5]{2,8}[市县区])(?:[，。\s]|$)/);
  const embedded = text.match(/(?:规划|分析|查询|去|到|在)\s*([\u4e00-\u9fa5]{2,8}?)(?=明天|后天|今天|未来|[一二两三四五六七\d]+[天日]|旅游|旅行|的|[，。]|$)/);
  if (named) patch.cityName = named[1];
  else if (common) patch.cityName = common[0] + (/香港|澳门/.test(common[0]) ? "特别行政区" : "市");
  else if (embedded && !/今天|明天|后天|未来|[一二两三四五六七\d]+[天日]|路线|活动|运动会/.test(embedded[1])) patch.cityName = embedded[1];
  // A bare place name is a valid answer to the destination question.
  else if (!known.cityName && !Object.keys(cleanIntake(patch)).length && /^[\u4e00-\u9fa5]{2,6}$/.test(text) && !/规划|旅游|路线|随便|安排|明天|后天|今天|出发|默认|推荐/.test(text)) patch.cityName = text;
  if (/你(?:来)?安排|按(?:常规|默认)|都可以|你(?:来)?推荐|帮我(?:选|定)/.test(text)) {
    const tourism = (patch.activityType || known.activityType) === "旅游规划";
    patch.startHour ??= known.startHour ?? 9;
    patch.duration ??= known.duration ?? 2;
    patch.participants ??= known.participants ?? (tourism ? 1 : 20);
    patch.group ??= known.group ?? "普通人群";
    patch.intensity ??= known.intensity ?? "低强度";
  }
  return cleanIntake(patch);
}

export function completeIntake(previous: IntakePatch, delta: IntakePatch, today: string) {
  const known = { ...cleanIntake(previous), ...cleanIntake(delta) };
  if (delta.date && !delta.endDate) delete known.endDate;
  if (delta.tripDays && !delta.endDate) delete known.endDate;
  if (known.date && known.tripDays && !known.endDate) known.endDate = addDays(known.date, known.tripDays - 1);
  if (known.date && known.endDate && known.endDate >= known.date) known.tripDays = Math.round((Date.parse(known.endDate) - Date.parse(known.date)) / 86400000) + 1;
  const tourism = known.activityType === "旅游规划";
  const missing: string[] = [];
  if (!known.activityType) missing.push("准备开展什么活动（旅游、运动会、体育课、社区活动、训练或研学）");
  if (!known.cityName) missing.push(tourism ? "想去哪个城市或区县" : "活动在哪个城市或区县举办");
  if (!known.date) missing.push(tourism ? "哪天出发（例如明天或10月25日）" : "活动是哪天");
  if (tourism && !known.tripDays) missing.push("计划玩几天");
  if (!tourism && !known.duration) missing.push("每次活动持续几小时");
  if (!known.participants) missing.push("大约几个人参加");
  if (!known.group) missing.push("同行或参与者是成年人、学生、老人，还是其他人群");
  if (!tourism && !known.intensity) missing.push("活动强度是低、中还是高");
  if (!tourism && known.startHour === undefined) missing.push("偏好上午、下午或晚上（也可以让我推荐）");
  let reply: string;
  const invalidRange = known.date && (known.date < today || (known.endDate && (known.endDate < known.date || known.endDate > addDays(today, 6))) || known.date > addDays(today, 6));
  if (invalidRange) reply = `当前可结合真实天气规划的日期为 ${today} 至 ${addDays(today, 6)}。请调整出发或结束日期，覆盖整个行程后我再分析。`;
  else if (missing.length) reply = `好的，${known.tripDays && tourism ? `${known.tripDays}天旅游已记下。` : "已记下你提供的条件。"}还需要了解：\n${missing.slice(0, 3).map((question, i) => `${i + 1}. ${question}？`).join("\n")}\n可以一条回复一起告诉我；人数、强度和时段也可以说“按常规推荐”。`;
  else reply = `条件齐了：${known.cityName}，${known.date}${known.endDate && known.endDate !== known.date ? ` 至 ${known.endDate}` : ""}，${known.activityType}，${known.participants}人（${known.group}）${tourism ? "，结合天气安排景点与美食" : `，每次${known.duration}小时，${known.intensity}`}。现在查询对应地区的真实数据并生成详细规划。`;
  const { tripDays: _days, ...patch } = known;
  void _days;
  return { command: missing.length || invalidRange ? "clarify" as const : "analyze" as const, reply, patch: { ...patch, ...(tourism ? { duration: known.duration ?? 2, startHour: known.startHour ?? 9, intensity: known.intensity ?? "低强度" as const } : {}), ...(known.date && !known.endDate ? { endDate: known.date } : {}) }, intake: { known }, missing };
}
