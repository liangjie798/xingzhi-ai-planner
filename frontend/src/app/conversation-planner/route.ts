import { NextResponse } from "next/server";
import { callLlm, extractJson } from "@/lib/llm-server";
import type { ActivityInput, ActivityType, GroupType, Intensity } from "@/lib/types";
import { resolveAccountModelConfig } from "@/lib/account-model-config-server";

export const maxDuration = 45;

interface ConversationRequest {
  message: string;
  today: string;
  context: ActivityInput;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface ConversationPatch {
  cityName?: string;
  activityType?: ActivityType;
  date?: string;
  endDate?: string;
  startHour?: number;
  duration?: number;
  participants?: number;
  intensity?: Intensity;
  group?: GroupType;
}

interface ConversationPlan {
  reply?: string;
  command?: "analyze" | "clarify";
  patch?: ConversationPatch;
}

const activityTypes: ActivityType[] = ["校园运动会", "体育课", "社区活动", "户外训练", "研学活动", "旅游规划"];
const intensities: Intensity[] = ["低强度", "中强度", "高强度"];
const groups: GroupType[] = ["普通人群", "儿童青少年", "老年人", "敏感人群", "外来旅游人群"];

function safePlan(plan: ConversationPlan | null): ConversationPlan {
  if (!plan) return { command: "clarify", reply: "我还需要城市、日期或活动类型，请补充其中一项。", patch: {} };
  const patch = plan.patch ?? {};
  if (patch.activityType && !activityTypes.includes(patch.activityType)) delete patch.activityType;
  if (patch.intensity && !intensities.includes(patch.intensity)) delete patch.intensity;
  if (patch.group && !groups.includes(patch.group)) delete patch.group;
  if (patch.startHour != null) patch.startHour = Math.min(23, Math.max(0, Math.round(patch.startHour)));
  if (patch.duration != null) patch.duration = Math.min(12, Math.max(1, Math.round(patch.duration)));
  if (patch.participants != null) patch.participants = Math.min(9999, Math.max(1, Math.round(patch.participants)));
  return { command: plan.command === "clarify" ? "clarify" : "analyze", reply: plan.reply || "条件已理解，正在重新读取数据并更新分析。", patch };
}

function fallbackPlan(body: ConversationRequest): ConversationPlan {
  const text = body.message;
  const patch: ConversationPatch = {};
  const duration = text.match(/(?:改成|持续|举办)?\s*([一二三四五六七八九十\d]+)\s*个?小时/);
  const values: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (duration) patch.duration = Number(duration[1]) || values[duration[1]];
  if (/明天/.test(text)) {
    const date = new Date(`${body.today}T00:00:00+08:00`); date.setDate(date.getDate() + 1);
    patch.date = date.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }); patch.endDate = patch.date;
  }
  if (/下午/.test(text)) patch.startHour = 14;
  if (/上午|早上/.test(text)) patch.startHour = 9;
  if (/晚上|夜间/.test(text)) patch.startHour = 19;
  patch.activityType = activityTypes.find((type) => text.includes(type))
    || (/运动会/.test(text) ? "校园运动会" : /旅游|行程|路线/.test(text) ? "旅游规划" : undefined);
  const dayRange = text.match(/未来\s*([一二三四五六七\d]+)\s*天/);
  if (dayRange) {
    const days = Math.min(7, Math.max(1, Number(dayRange[1]) || values[dayRange[1]] || 1));
    const first = new Date(`${body.today}T00:00:00+08:00`);
    const last = new Date(first); last.setDate(last.getDate() + days - 1);
    patch.date = first.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
    patch.endDate = last.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  }
  const cityPattern = /([\u4e00-\u9fa5]{2,8}?)(市|区|县)?(?=明天|今天|后天|未来|的天气|天气|下午|上午|早上|晚上|夜间|旅游|举办|开展|举行)/;
  const city = text.match(new RegExp(`(?:分析|查询|看看|规划|去|到|在)\\s*${cityPattern.source}`))
    ?? text.match(new RegExp(`^${cityPattern.source}`))
    ?? text.match(new RegExp(`[，。,.\\s]${cityPattern.source}`));
  if (city && !/^(今天|明天|后天)$/.test(city[1])) patch.cityName = `${city[1]}${city[2] || "市"}`;
  return { command: "analyze", patch, reply: "我已根据上下文更新条件，正在查询真实逐小时数据并重新生成图表与结论。" };
}

export async function POST(request: Request) {
  let body: ConversationRequest;
  try { body = await request.json() as ConversationRequest; }
  catch { return NextResponse.json({ detail: "请求体不是合法 JSON" }, { status: 400 }); }
  if (!body.message?.trim()) return NextResponse.json({ detail: "请输入分析要求" }, { status: 400 });
  const prompt = [
    `当前北京时间日期：${body.today}。`,
    `当前表单条件：${JSON.stringify(body.context)}。`,
    `最近对话：${JSON.stringify((body.history ?? []).slice(-6))}。`,
    `用户新要求：${body.message.trim()}。`,
    "理解用户对前文条件的省略引用。将自然语言转换为表单增量 patch；未提及的字段不要输出，不能臆造城市。",
    "日期必须为 YYYY-MM-DD；明天、后天等按当前日期换算。下午默认14时、上午默认9时、晚上默认19时。",
    `activityType 只能为：${activityTypes.join("、")}；intensity 只能为：${intensities.join("、")}；group 只能为：${groups.join("、")}。`,
    "只输出 JSON：{\"reply\":\"简短说明将更新什么\",\"command\":\"analyze或clarify\",\"patch\":{\"cityName\":\"西安市\",\"date\":\"YYYY-MM-DD\",\"endDate\":\"YYYY-MM-DD\",\"startHour\":14,\"duration\":2,\"activityType\":\"校园运动会\"}}。",
    "若请求足以执行或只是修改前文某一个条件，command 必须为 analyze；只有完全无法判断用户要分析什么时才 clarify。",
  ].join("\n");
  try {
    const config = await resolveAccountModelConfig(request);
    const result = await callLlm({ system: "你是适候平台的对话式数据分析调度器，只负责理解条件和调用现有分析流程，不直接编造天气或结论。", prompt, config });
    return NextResponse.json({ ...safePlan(extractJson<ConversationPlan>(result.text)), provider: `${result.provider} · ${result.model}` });
  } catch {
    return NextResponse.json({ ...safePlan(fallbackPlan(body)), provider: "本地语义兜底" });
  }
}
