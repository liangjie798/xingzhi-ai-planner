import { NextResponse } from "next/server";
import { callLlm, extractJson } from "@/lib/llm-server";
import { resolveAccountModelConfig } from "@/lib/account-model-config-server";
import { cleanIntake, completeIntake, extractIntake, type IntakePatch, type IntakeState } from "@/lib/conversation-intake";
import { classifyConversation } from "@/lib/conversation-knowledge";
import { answerKnowledge, answerWeather } from "@/lib/conversation-answer";

export const maxDuration = 45;
interface ConversationRequest {
  message: string;
  today: string;
  intake?: IntakeState;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export async function POST(request: Request) {
  let body: ConversationRequest;
  try { body = await request.json() as ConversationRequest; }
  catch { return NextResponse.json({ detail: "请求体不是合法 JSON" }, { status: 400 }); }
  if (typeof body.message !== "string" || !body.message.trim()) return NextResponse.json({ detail: "请输入规划要求" }, { status: 400 });
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const known = cleanIntake(body.intake?.known);
  const message = body.message.trim().slice(0, 4000);
  const history = Array.isArray(body.history) ? body.history.filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string").slice(-6).map((item) => ({ role: item.role, content: item.content.slice(0, 4000) })) : [];
  const pending = Object.keys(known).length > 0 || /还需要了解|哪天|哪个城市|几个人/.test(history.filter((h) => h.role === "assistant").at(-1)?.content || "");
  const lastAssistant = history.filter((h) => h.role === "assistant").at(-1)?.content || "";
  const weatherFollowup = /天气预报（北京时间）|你想查询哪个城市|可靠天气数据|可靠天气。/.test(lastAssistant) && /^(?:那|那么)?(?:大后天|后天|明天|今天|[\u4e00-\u9fa5]{2,8}[市县区]?)(?:呢|的呢|[?？。])?$/.test(message) && !/规划|行程|旅游|活动|学生|老人|强度/.test(message);
  const intent = weatherFollowup ? "weather" : classifyConversation(message, pending);
  if (intent !== "planning") {
    const previousWeather = weatherFollowup ? extractIntake(history.filter((h) => h.role === "user" && h.content !== message).at(-1)?.content || "", today, {}) : {};
    const weatherContext = { cityName: previousWeather.cityName || known.cityName, ...(weatherFollowup && previousWeather.date ? { date: previousWeather.date } : {}) };
    const answer = intent === "weather" ? await answerWeather(request, message, today, weatherContext) : await answerKnowledge(request, message, history);
    // A question must never overwrite a pending planning form or trigger generation.
    return NextResponse.json({ ...answer, command: "answer", patch: {}, intake: { known }, missing: [], provider: answer.kind });
  }
  let delta = extractIntake(message, today, known);
  let provider = "对话条件确认";
  // Common answers are parsed locally; use the model for unstructured places and relative dates.
  if (!Object.keys(delta).length || /下周|周[一二三四五六日天]|下个月/.test(message) || (!delta.cityName && /(?:去|在|到).{2,12}(?:旅游|旅行|举办)/.test(message))) {
    try {
      const config = await resolveAccountModelConfig(request);
      const result = await callLlm({
        system: "你是规划需求提取器。只提取本条消息明确给出的事实，不能补全城市、日期、人数、人群等默认值。只输出JSON。",
        prompt: [
          "当前北京时间日期：" + today,
          "用户之前已确认：" + JSON.stringify(known),
          "最近对话（只用于理解省略，不把系统默认值当用户选择）：" + JSON.stringify((body.history ?? []).slice(-6)),
          "本条消息：" + message,
          '输出 {"patch":{}}，可用字段 cityName,activityType,date,endDate,tripDays,startHour,duration,participants,intensity,group。未提及字段不要输出。',
          "activityType只能为校园运动会、体育课、社区活动、户外训练、研学活动、旅游规划；intensity为低强度、中强度、高强度；group为普通人群、儿童青少年、老年人、敏感人群、外来旅游人群。",
          "三天旅游只输出tripDays:3和activityType，不输出任何日期城市。只说杭州就只输出cityName。日期使用YYYY-MM-DD。",
        ].join("\n"), config,
      });
      const parsed = extractJson<{ patch?: IntakePatch }>(result.text);
      delta = { ...cleanIntake(parsed?.patch), ...delta };
      provider = result.provider + " · " + result.model;
    } catch { provider = "对话条件确认 · 本地解析"; }
  }
  return NextResponse.json({ ...completeIntake(known, delta, today), provider });
}
