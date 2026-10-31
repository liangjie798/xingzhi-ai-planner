import type { ActivityInput } from "./types";
import { journeyLocations } from "./journey.ts";

export type IntakePatch = Partial<Pick<ActivityInput, "journeyDestination" | "departureDate" | "originCity" | "audienceDescription" | "budgetPerPerson" | "equipmentCount" | "teamSize" | "cityName" | "activityType" | "date" | "endDate" | "startHour" | "duration" | "participants" | "intensity" | "group" | "referenceUrls" | "allowedStartHour" | "allowedEndHour">> & { tripDays?: number };
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
export { number as parseConversationNumber };
export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00+08:00`) + days * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

/** Parse a date phrase relative to Beijing today. This is shared by planning and weather follow-ups. */
export function relativeDateFromText(text: string, today: string): string | undefined {
  const compact = text.replace(/\s+/g, "");
  const range=compact.match(/(大后天|后天|明天|今天|今日|下周)(?:到|至|—|~)(大后天|后天|明天|今天|今日|下周)/);
  if(range)return relativeDateFromText(range[1],today);
  // Parse numeric offsets before day words: "10天后天气" contains "后天"
  // across the offset/weather boundary, but means ten days rather than two.
  const weeks = compact.match(/(?:再过|过|往后)?([一二两三四五六七八九十\d]+)个?(?:星期|周)(?:以|之)?后/);
  if (weeks) return addDays(today, number(weeks[1]) * 7);
  const days = compact.match(/(?:再过|过|往后)?([一二两三四五六七八九十\d]+)天(?:以|之)?后/)
    || compact.match(/(?:再过|过)([一二两三四五六七八九十\d]+)天/);
  if (days) return addDays(today, number(days[1]));
  if (/大后天/.test(compact)) return addDays(today, 3);
  if (/后天/.test(compact)) return addDays(today, 2);
  if (/明天/.test(compact)) return addDays(today, 1);
  if (/今天|今日/.test(compact)) return today;
  if (/下周/.test(compact)) return addDays(today, 7);
  return undefined;
}
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** A day without a month means this Beijing calendar month, never a saved query date. */
export function calendarDateFromText(text:string, today:string): { matched:boolean; date?:string; error?:string } {
  const token = "([零〇一二两三四五六七八九十\\d]+)";
  const full = text.match(/(?<!\d)(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})[日号]?(?!\d)/);
  // Resolve M-D/M/D before bare days; otherwise "11-1日" becomes this month's 1st.
  const short = text.match(/(?<![\d\-/])(\d{1,2})[-/](\d{1,2})(?:[日号])?(?![\d\-/])/);
  const monthDay = text.match(new RegExp(`(?:(今年|明年))?${token}月${token}[日号]?`));
  const bare = text.match(new RegExp(`(?:(本月|这个月|下个月|下月))?${token}[日号]`));
  if (!full && !short && !monthDay && !bare) return {matched:false};
  let year=Number(today.slice(0,4)), month=Number(today.slice(5,7)), day:number;
  if(full) { year=Number(full[1]);month=Number(full[2]);day=Number(full[3]); }
  else if(short) { month=Number(short[1]);day=Number(short[2]); }
  else if(monthDay) { year+=monthDay[1] === "明年" ? 1 : 0;month=number(monthDay[2]);day=number(monthDay[3]); }
  else { day=number(bare![2]);if(/下/.test(bare![1] || "")){month++;if(month>12){month=1;year++;}} }
  const date=`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  return validDate(date) ? {matched:true,date} : {matched:true,error:`${year}年${month}月没有${day}号，请提供有效日期。`};
}
export function cleanIntake(raw: IntakePatch = {}): IntakePatch {
  const out: IntakePatch = {};
  if(typeof raw.originCity==="string"&&raw.originCity.trim()) out.originCity=raw.originCity.trim().slice(0,40);
  if(typeof raw.journeyDestination==="string"&&raw.journeyDestination.trim()) out.journeyDestination=raw.journeyDestination.trim().slice(0,40);
  if(validDate(raw.departureDate)) out.departureDate=raw.departureDate;
  if(typeof raw.audienceDescription === "string" && /^(大学生|研究生|高中生|初中生|小学生|学生|成年人|老年人|亲子家庭|儿童青少年|敏感人群)$/.test(raw.audienceDescription)) out.audienceDescription=raw.audienceDescription;
  for(const field of ["budgetPerPerson","equipmentCount","teamSize"] as const) if(typeof raw[field]==="number"&&Number.isFinite(raw[field])&&raw[field]!>=1&&raw[field]!<=100000) out[field]=Math.round(raw[field]!);
  if (Array.isArray(raw.referenceUrls)) out.referenceUrls = raw.referenceUrls.filter((url) => typeof url === "string" && /^https:\/\/(?:[a-z0-9-]+\.)*(?:douyin|xiaohongshu)\.com\//i.test(url)).slice(0, 4);
  if (typeof raw.cityName === "string" && raw.cityName.trim()) out.cityName = raw.cityName.trim().slice(0, 40);
  if (activities.includes(raw.activityType!)) out.activityType = raw.activityType;
  if (validDate(raw.date)) out.date = raw.date;
  if (validDate(raw.endDate)) out.endDate = raw.endDate;
  if (["低强度", "中强度", "高强度"].includes(raw.intensity!)) out.intensity = raw.intensity;
  if (["普通人群", "儿童青少年", "老年人", "敏感人群", "外来旅游人群"].includes(raw.group!)) out.group = raw.group;
  // Remember the requested length even outside the forecast horizon; completeIntake blocks execution.
  for (const [key, min, max] of [["startHour", 6, 20], ["allowedStartHour", 6, 20], ["allowedEndHour", 7, 21], ["duration", 1, 8], ["participants", 1, 9999], ["tripDays", 1, 365]] as const) {
    const value = raw[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) out[key] = value;
  }
  return out;
}

/** Explicit facts only: the dashboard's initial Hangzhou/date/500 students are not answers. */
export function extractIntake(text: string, today: string, known: IntakePatch): IntakePatch {
  const patch: IntakePatch = {};
  const audience=text.match(/大学生|研究生|高中生|初中生|小学生|学生|成年人|老年人|儿童青少年|敏感人群/);
  if(audience) patch.audienceDescription=audience[0];
  if(/亲子/.test(text)) patch.audienceDescription="亲子家庭";
  if(/老人|长者/.test(text)) patch.audienceDescription="老年人";
  if(!audience&&/儿童|孩子|青少年/.test(text)) patch.audienceDescription="儿童青少年";
  if(!audience&&/成人|成年|年轻人|普通人群/.test(text)) patch.audienceDescription="成年人";
  const budget=text.match(/(?:人均|每人|预算每人)\s*([一二两三四五六七八九十百千\d]+)\s*元?/);
  if(budget) patch.budgetPerPerson=number(budget[1]);
  const equipment=text.match(/(?<![\d.负−-])([一二两三四五六七八九十百千\d]+)\s*(?:个|套|副|件)(?:篮球|足球|球拍|器材|装备)/)
    || text.match(/(?:篮球|足球|球拍|器材|装备)\s*(?:数量)?\s*(?:改成|改为|调整为|为|是|有|共|：|:)?\s*(?<![\d.负−-])([一二两三四五六七八九十百千\d]+)\s*(?:个|套|副|件)/);
  if(equipment) patch.equipmentCount=number(equipment[1]);
  const team=text.match(/(?:每组|一组)\s*([一二两三四五六七八九十\d]+)\s*人/);
  if(team) patch.teamSize=number(team[1]);
  const links = text.match(/https:\/\/(?:[a-z0-9-]+\.)*(?:douyin|xiaohongshu)\.com\/[^\s，。；<>]+/gi);
  if (links) patch.referenceUrls = [...new Set([...(known.referenceUrls || []), ...links])].slice(0, 4);
  patch.activityType = activities.find((item) => text.includes(item)) || (/运动会/.test(text) ? "校园运动会" : /旅游|旅行|行程|游玩|游览|玩\s*[一二两三四五六七八九十\d]+天/.test(text) ? "旅游规划" : undefined);
  // Calendar days are dates, not trip lengths. Keep "三日游" as a duration.
  const durationText = text.replace(/20\d{2}[-/年]\d{1,2}[-/月]\d{1,2}[日号]?|[零〇一二两三四五六七八九十\d]+月[零〇一二两三四五六七八九十\d]+[日号]?|\d{1,2}[-/]\d{1,2}[日号]?/g, "");
  const days = durationText.match(/([一二两三四五六七八九十\d]+)\s*(?:天(?!期|后|以后|之后)|日(?=游|旅|行程|活动))/);
  if (days) patch.tripDays = number(days[1]);
  const duration = text.match(/(\d+(?:\.\d+)?|[一二两三四五六七八九十]+)\s*个?小时/);
  if (duration) patch.duration = /^\d/.test(duration[1]) ? Number(duration[1]) : number(duration[1]);
  const participantText=text.replace(/(?:每组|一组)\s*[一二两三四五六七八九十\d]+\s*人/g,"");
  const people = participantText.match(/(?<![\d.负−-])([零〇一二两三四五六七八九十百千\d]+)\s*(?:个|位|名)?\s*(?:大学生|研究生|成年人|成人|初中生|高中生|小学生|学生|同学|小朋友|孩子|老人|老年人|人|位|名)/)
    || (known.activityType && !known.participants ? text.match(/^\s*([零〇一二两三四五六七八九十百千\d]+)\s*个?[。！]?\s*$/) : null);
  if (people) patch.participants = number(people[1]);
  if (/大学生|研究生|成年人|成人/.test(text)) patch.group = "普通人群";
  else if (/儿童|学生|初中生|高中生|亲子|孩子|青少年/.test(text)) patch.group = "儿童青少年";
  else if (/老人|老年|长者/.test(text)) patch.group = "老年人";
  else if (/敏感人群/.test(text)) patch.group = "敏感人群";
  else if (/成人|成年|普通人群|年轻人/.test(text)) patch.group = "普通人群";
  patch.intensity = /低强度|轻松|轻量/.test(text) ? "低强度" : /高强度|高负荷/.test(text) ? "高强度" : /中强度|适中/.test(text) ? "中强度" : undefined;
  const intensityAnswer = text.trim().match(/^(?:活动)?(?:强度\s*(?:为|是|选|选择|：|:)?\s*)?(低|中|高)(?:等)?(?:强度)?[。！!？?]?$/);
  if (intensityAnswer && (known.activityType || /强度/.test(text))) patch.intensity = `${intensityAnswer[1]}强度` as ActivityInput["intensity"];
  const dates = [...text.matchAll(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})日?/g)].map((m) => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`);
  if (dates[0]) patch.date = dates[0];
  else {
    const relative = relativeDateFromText(text, today) || (/未来/.test(text) ? today : undefined);
    if (relative) patch.date = relative;
    const monthDay = text.match(/(\d{1,2})月(\d{1,2})[日号]?/);
    if (monthDay) patch.date = `${today.slice(0, 4)}-${monthDay[1].padStart(2, "0")}-${monthDay[2].padStart(2, "0")}`;
  }
  const calendar = calendarDateFromText(text,today);
  // A trailing calendar day in "明天到30号" is the range end, not a new start.
  if(calendar.date && (!patch.date || !relativeDateFromText(text,today))) patch.date=calendar.date;
  const relativeRange=text.match(/(大后天|后天|明天|今天|今日|下周)\s*(?:到|至|—|~)\s*(大后天|后天|明天|今天|今日|下周)/);
  if(relativeRange){patch.date=relativeDateFromText(relativeRange[1],today);patch.endDate=relativeDateFromText(relativeRange[2],today);}
  if (dates[1]) patch.endDate = dates[1];
  else {
    const rangeEnd = text.match(/(?:到|至|直到|截至)\s*(?:(\d{1,2})月)?(\d{1,2})[日号]/);
    if (rangeEnd) {
      const start = patch.date || known.date || today;
      patch.endDate = `${start.slice(0,4)}-${(rangeEnd[1] || start.slice(5,7)).padStart(2,"0")}-${rangeEnd[2].padStart(2,"0")}`;
      if (!rangeEnd[1] && patch.endDate < start) {
        const next = new Date(`${start.slice(0,7)}-15T00:00:00+08:00`);
        next.setUTCMonth(next.getUTCMonth() + 1);
        patch.endDate = `${next.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }).slice(0,7)}-${rangeEnd[2].padStart(2,"0")}`;
      }
    }
  }
  const hour = text.match(/(?:早上|上午|下午|晚上|中午)?\s*(\d{1,2})(?:点|时|:00)/);
  if (hour) patch.startHour = Number(hour[1]) + (/下午|晚上/.test(text) && Number(hour[1]) < 12 ? 12 : 0);
  else if (/下午/.test(text)) patch.startHour = 14;
  else if (/早上|上午/.test(text)) patch.startHour = 9;
  else if (/晚上/.test(text)) patch.startHour = 19;
  if (/下午/.test(text)) { patch.allowedStartHour = 12; patch.allowedEndHour = 18; }
  else if (/早上|上午/.test(text)) { patch.allowedStartHour = 6; patch.allowedEndHour = 12; }
  else if (/晚上/.test(text)) { patch.allowedStartHour = 18; patch.allowedEndHour = 21; }
  if (/不限时段|全天|取消.*(?:时段|下午|上午).*限制/.test(text)) { patch.allowedStartHour = 6; patch.allowedEndHour = 21; }
  const timeRange=text.match(/(?:(上午|早上|下午|晚上|中午)\s*)?([零一二两三四五六七八九十\d]+)(?:点|时|:00|：00)\s*(?:到|至|[-—~])\s*(?:(上午|早上|下午|晚上|中午)\s*)?([零一二两三四五六七八九十\d]+)(?:点|时|:00|：00)/);
  if(timeRange){
    const period=timeRange[1] || (/(?:下午|晚上)/.test(text)?text.match(/下午|晚上/)?.[0]:undefined);
    const convert=(value:string,label?:string)=>number(value)+(/下午|晚上/.test(label || "")&&number(value)<12?12:0);
    patch.allowedStartHour=convert(timeRange[2],period);patch.allowedEndHour=convert(timeRange[4],timeRange[3]||period);patch.startHour=patch.allowedStartHour;
  }
  const common = text.match(/北京|上海|广州|深圳|杭州|成都|武汉|南京|西安|香港|澳门|重庆|天津/);
  const locationText=text.replace(/^(?:请|帮我|帮忙|规划|分析|查询|我想去|去|在|到|目的地[是为：:]?|城市[是为：:]?)+/,"");
  const fullAdministrative=locationText.match(/^([\u4e00-\u9fa5]{2,18}?[省市区县旗])(?=明天|后天|今天|未来|出发|旅游|旅行|[一二两三四五六七八九十\d]+[日天号个名人]|[，。；\s]|$)/);
  const named = fullAdministrative || text.match(/(?:去|在|到|目的地[是为：:]?|城市[是为：:]?)\s*([\u4e00-\u9fa5]{2,8}?[市县区])/) || text.match(/^([\u4e00-\u9fa5]{2,8}[市县区])(?:[，。\s]|$)/);
  const embedded = text.match(/(?:规划|分析|查询|去|到|在)\s*([\u4e00-\u9fa5]{2,8}?)(?=明天|后天|今天|未来|[一二两三四五六七\d]+[天日]|旅游|旅行|的|[，。]|$)/);
  if (named) patch.cityName = named[1];
  else if (common) patch.cityName = common[0] + (/香港|澳门/.test(common[0]) ? "特别行政区" : "市");
  else if (embedded && !/今天|明天|后天|未来|[一二两三四五六七\d]+[天日]|路线|活动|运动会|比较|对比|一起|图表|范围|时间|条件/.test(embedded[1])) patch.cityName = embedded[1];
  // A bare place name is a valid answer to the destination question.
  else if (!known.cityName && !Object.keys(cleanIntake(patch)).length && /^[\u4e00-\u9fa5]{2,6}$/.test(text) && !/规划|旅游|路线|随便|安排|明天|后天|今天|出发|默认|推荐/.test(text)) patch.cityName = text;
  const journey=journeyLocations(text);
  if(journey.originCity){patch.originCity=journey.originCity;if(!journey.destination)delete patch.cityName;}
  if(journey.destination)patch.cityName=journey.destination;
  if (/你(?:来)?安排|按(?:常规|默认)|常规推荐|默认推荐|都可以|你(?:来)?推荐|帮我(?:选|定)/.test(text)) {
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
  const invalidWindow = !tourism && known.duration && known.duration > (known.allowedEndHour ?? 21) - (known.allowedStartHour ?? 6);
  if (invalidRange) reply = `已保留${[known.cityName, `${known.date}出发/开展`, known.tripDays ? `${known.tripDays}天` : "", known.participants ? `${known.participants}人` : ""].filter(Boolean).join("，")}。当前可结合真实天气规划的日期为 ${today} 至 ${addDays(today, 6)}。请只调整出发或结束日期（也可缩短行程天数）以覆盖整个行程，其他条件不用重复提供；本次未重新计算。`;
  else if (invalidWindow) reply = `已记下活动持续${known.duration}小时，但所选${known.allowedStartHour ?? 6}:00–${known.allowedEndHour ?? 21}:00时段无法容纳完整活动。请缩短时长，或选择不限时段后重新分析。`;
  else if (missing.length) reply = `好的，${known.tripDays && tourism ? `${known.tripDays}天旅游已记下。` : "已记下你提供的条件。"}还需要了解：\n${missing.slice(0, 3).map((question, i) => `${i + 1}. ${question}？`).join("\n")}\n可以一条回复一起告诉我；人数、强度和时段也可以说“按常规推荐”。`;
  else reply = `条件齐了：${known.cityName}，${known.date}${known.endDate && known.endDate !== known.date ? ` 至 ${known.endDate}` : ""}，${known.activityType}，${known.participants}人（${known.audienceDescription || known.group}）${tourism ? "，结合天气安排景点与美食" : `，每次${known.duration}小时，${known.intensity}`}。现在查询对应地区的真实数据并生成详细规划。`;
  const { tripDays: _days, ...patch } = known;
  void _days;
  const choices = invalidRange ? [] : intakeChoices(known);
  return { command: missing.length || invalidRange || invalidWindow ? "clarify" as const : "analyze" as const, reply, choices, patch: { ...patch, ...(tourism ? { duration: known.duration ?? 2, startHour: known.startHour ?? 9, intensity: known.intensity ?? "低强度" as const } : {}), ...(known.date && !known.endDate ? { endDate: known.date } : {}) }, intake: { known }, missing };
}

export interface IntakeChoice { label: string; message: string }
/** Show only choices for the next unanswered field. All choices use the normal conversation parser. */
export function intakeChoices(known: IntakePatch): IntakeChoice[] {
  const choose = (values: string[]) => values.map(value => ({ label: value, message: value }));
  if (known.duration && known.activityType !== "旅游规划" && known.duration > (known.allowedEndHour ?? 21) - (known.allowedStartHour ?? 6)) return [{ label: "不限时段，由系统推荐", message: "不限时段，常规推荐" }, ...choose(["1小时", "2小时"])];
  if (!known.activityType) return choose([...activities]);
  if (!known.cityName || !known.date) return [];
  if (known.activityType === "旅游规划" && !known.tripDays) return choose(["一天旅游", "两天旅游", "三天旅游"]);
  if (known.activityType !== "旅游规划" && !known.duration) return choose(["1小时", "2小时", "4小时", "6小时"]);
  if (!known.participants) return choose(["2人", "10人", "30人", "100人"]);
  if (!known.group) return choose(["成年人", "学生", "大学生", "老年人"]);
  if (known.activityType !== "旅游规划" && !known.intensity) return choose(["低强度", "中强度", "高强度"]);
  if (known.activityType !== "旅游规划" && known.startHour === undefined) return [...choose(["上午", "下午", "晚上"]), { label: "不限时段，由系统推荐", message: "不限时段，常规推荐" }];
  return [];
}

/** Modification commands update a confirmed plan before generic Q&A routing. */
export function isPlanRevision(message: string, known: IntakePatch): boolean {
  if (!known.activityType) return false;
  if (/来源|出处|是什么意思|有什么区别|为什么|如何使用/.test(message)) return false;
  if(/(?:人均|每人|预算每人)\s*[一二两三四五六七八九十百千\d]+|[一二两三四五六七八九十百千\d]+\s*(?:个|套|副|件)(?:篮球|足球|球拍|器材|装备)|每组\s*[一二两三四五六七八九十\d]+人/.test(message)) return true;
  return /改成|改为|换成|调整|改到|只看|仅看|只考虑|只在|参与者|参加者|人数|取消.*限制|不限时段|重新分析|重新计算|(?:画|绘制|生成).*(?:对比图|比较图)|两天.*对比/.test(message)
    || /^(?:那|如果|那么)?[一二两三四五六七八九十\d]+个?小时呢[？?]?$/.test(message.trim());
}
