import { NextResponse } from "next/server";
import { callLlm, extractJson } from "@/lib/llm-server";
import { resolveAccountModelConfig } from "@/lib/account-model-config-server";
import { addDays, relativeDateFromText, cleanIntake, completeIntake, extractIntake, isPlanRevision, type IntakePatch, type IntakeState } from "@/lib/conversation-intake";
import { classifyConversation, isWeatherFollowup } from "@/lib/conversation-knowledge";
import { answerKnowledge, answerWeather } from "@/lib/conversation-answer";
import { candidateCityTopic, cityIntroductionSubject } from "@/lib/city-introduction";
import { cleanDestinationContext, destinationRecommendationRequest, isDestinationFollowup, type DestinationContext } from "@/lib/destination-knowledge";
import { answerDestination } from "@/lib/destination-answer";
import { weatherDestination } from "@/lib/conversation-weather";
import { compareJourney,type JourneyQuote } from "@/lib/journey";

export const maxDuration = 45;
interface ConversationRequest {
  journeyQuotes?:JourneyQuote[];
  journeyTimeValue?:number;
  journeyParticipants?:number;
  message: string;
  today: string;
  intake?: IntakeState;
  knowledgeContext?: DestinationContext;
  weatherContext?: { cityName?: string; date?: string };
  activeTopic?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export async function POST(request: Request) {
  let body: ConversationRequest;
  try { body = await request.json() as ConversationRequest; }
  catch { return NextResponse.json({ detail: "请求体不是合法 JSON" }, { status: 400 }); }
  if (typeof body.message !== "string" || !body.message.trim()) return NextResponse.json({ detail: "请输入规划要求" }, { status: 400 });
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  let known = cleanIntake(body.intake?.known);
  const message = body.message.trim().slice(0, 4000);
  const history = Array.isArray(body.history) ? body.history.filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string").slice(-12).map((item) => ({ role: item.role, content: item.content.slice(0, 4000) })) : [];
  const pending = Object.keys(known).length > 0 || /还需要了解|哪天|哪个城市|几个人/.test(history.filter((h) => h.role === "assistant").at(-1)?.content || "");
  const lastAssistant = history.filter((h) => h.role === "assistant").at(-1)?.content || "";
  const transportQuestion=/(?:高铁|动车|航班|飞机|火车|机票).*(?:性价比|划算|比较|对比|哪个|哪种|票价)|(?:性价比|划算|比较|对比|哪个|哪种).*(?:高铁|动车|航班|飞机|火车|机票)|怎么去|如何去/.test(message);
  const transportFollowup=body.activeTopic==="transport"&&!/天气|气温|下雨|AQI|规划|运动会|研学|体育课|社区|训练|景点|美食|介绍|来源|为什么/.test(message);
  if(transportQuestion||transportFollowup){
    const facts=extractIntake(message,today,known);
    let origin=facts.originCity || known.originCity;
    if(!origin&&transportFollowup&&!/从|到|去/.test(message)){
      const answer=message.match(/^([\u4e00-\u9fa5]{2,12}?)(?=明天|后天|今天|[，。\s]|$)/)?.[1];
      if(answer&&!/明天|后天|今天|一周|两周|以后|之后|高铁|飞机|航班|比较|划算|推荐|确认/.test(answer))origin=answer;
    }
    const destination=facts.cityName || known.journeyDestination || known.cityName;
    const departureDate=facts.date || known.departureDate || known.date;
    const patch=cleanIntake({originCity:origin,journeyDestination:destination,departureDate});
    const missing=[!origin?"从哪个城市出发":null,!destination?"要去哪个城市或区县":null,!departureDate?"哪天出发":null].filter(Boolean);
    const timeValue=typeof body.journeyTimeValue==="number"&&Number.isFinite(body.journeyTimeValue)?Math.min(10000,Math.max(0,body.journeyTimeValue)):0;
    const passengers=typeof body.journeyParticipants==="number"&&Number.isFinite(body.journeyParticipants)?Math.min(100000,Math.max(1,Math.round(body.journeyParticipants))):known.participants || 1;
    const comparison=compareJourney(Array.isArray(body.journeyQuotes)?body.journeyQuotes.slice(0,20):[],origin || "",destination || "",departureDate || "",passengers,timeValue);
    const reply=missing.length?`可以比较高铁与航班。请补充：${missing.join("、")}。我会分别核算票款、未包含的税费/行李、两端接驳及门到门时间。`:comparison.comparable?`按你录入的${origin} → ${destination}、${departureDate}报价计算：\n${comparison.rows.map(row=>`${row.mode}：单人门到门费用${row.cost}元，总时长${row.minutes}分钟。`).join("\n")}\n费用较低方案为${comparison.cheapest!.mode}，时间较短方案为${comparison.fastest!.mode}；按你设置的每小时${timeValue}元时间价值，比较值较低方案为${comparison.recommended!.mode}。若数值相同视为并列。报价由用户录入，未独立核验实时票价、余票及退改条件；到达后活动排程未自动调整。`:`交通比较条件：${origin} → ${destination}，${departureDate}。当前未接入可核验的实时报价，不能直接认定高铁或航班更划算。请在下方“出发地与交通比较”中录入同日的报价、未含费用、两端接驳与候车/值机时间；系统会计算更省钱、更省时及你设置的时间价值下的结果。比较只针对交通，不会自动改变已有活动排程。`;
    return NextResponse.json({reply,kind:"交通方案比较",command:"answer",patch,intake:{known:{...known,...patch}},missing,activeTopic:"transport",sources:[{title:"12306官方车票查询",url:"https://www.12306.cn/index/",detail:"官方查询入口，不代表本次已取得票价或余票"},{title:"东方航空官网",url:"https://www.ceair.com/",detail:"航班查询入口；请核对日期、含税总价、行李和退改条件"}]});
  }
  const knowledgeContext = cleanDestinationContext(body.knowledgeContext);
  if (body.knowledgeContext === undefined && !knowledgeContext.city) {
    const previousCity = history.filter((item) => item.role === "user" && item.content !== message).map((item) => cityIntroductionSubject(item.content)).filter(Boolean).at(-1);
    if (previousCity) { knowledgeContext.city = previousCity; knowledgeContext.topic = "introduction"; }
  }
  const savedWeather = cleanIntake(body.weatherContext && typeof body.weatherContext === "object" ? body.weatherContext : {});
  const fieldAnswer = Boolean(known.activityType) && /^(?:强度\s*(?:是|为|：|:)?\s*)?(?:高|中|低)(?:强度)?[？?。！!]*$|^(?:按)?(?:常规|默认)推荐[？?。！!]*$/.test(message);
  const weatherFollowup = isWeatherFollowup(message, body.activeTopic === "weather" ? "天气预报（北京时间）" : lastAssistant);
  const revision = isPlanRevision(message, known) || body.activeTopic === "planning" && Boolean(relativeDateFromText(message, today)) && !/天气|气温|下雨|是什么|为什么|来源/.test(message);
  const comparison = Boolean(known.activityType) && /对比|比较/.test(message) && /图|两天|两日/.test(message);
  const destinationFollowup = isDestinationFollowup(message, knowledgeContext);
  const recommendation = destinationRecommendationRequest(message);
  const intent = revision || comparison || fieldAnswer ? "planning" : weatherFollowup ? "weather" : destinationFollowup || recommendation ? "knowledge" : classifyConversation(message, pending);
  if (intent === "planning" && !known.cityName) {
    const city = body.activeTopic === "weather" ? savedWeather.cityName : knowledgeContext.city || savedWeather.cityName;
    if (city) known = { ...known, cityName: city };
  }
  if (intent === "knowledge" && relativeDateFromText(message, today) && message.length < 20 && !/天气|气温|规划|旅行|旅游/.test(message)) {
    return NextResponse.json({ reply: "这次是想继续查询天气，还是调整活动日期？请补充一下查询内容，我会沿用已确认的城市与条件。", kind: "需要确认话题", command: "answer", patch: {}, intake: { known }, missing: [], knowledgeContext, weatherContext: savedWeather, activeTopic: body.activeTopic || "knowledge", sources: [] });
  }
  if (intent !== "planning") {
    if (intent === "knowledge" && (candidateCityTopic(message) || destinationFollowup || recommendation)) {
      const destination = await answerDestination(message, knowledgeContext, known.cityName);
      if (destination) return NextResponse.json({ ...destination, command: "answer", patch: {}, intake: { known }, missing: [], provider: destination.kind });
    }
    const previousWeather = weatherFollowup ? history.filter((h) => h.role === "user" && h.content !== message).reduce<IntakePatch>((state, h) => ({ ...state, ...extractIntake(h.content, today, state) }), {}) : {};
    const weatherContext = { cityName: savedWeather.cityName || previousWeather.cityName || knowledgeContext.city || known.cityName, date: savedWeather.date || previousWeather.date };
    const answer = intent === "weather" ? await answerWeather(request, message, today, weatherContext) : await answerKnowledge(request, message, history);
    const facts = extractIntake(message, today, weatherContext);
    const nextWeatherContext = intent === "weather" ? answer.weatherContext || { cityName: weatherDestination(message, facts.cityName, weatherContext.cityName), date: facts.date || weatherContext.date || today } : savedWeather;
    // A question must never overwrite a pending planning form or trigger generation.
    return NextResponse.json({ ...answer, command: "answer", patch: {}, intake: { known }, missing: [], provider: answer.kind, knowledgeContext, weatherContext: nextWeatherContext, activeTopic: intent === "weather" || body.activeTopic === "weather" && /来源|依据/.test(message) ? "weather" : "knowledge" });
  }
  let delta = extractIntake(message, today, known);
  if (comparison && known.date) delta = { ...delta, endDate: addDays(delta.date || known.date, 1) };
  let provider = "对话条件确认";
  // Common answers are parsed locally; use the model for unstructured places and relative dates.
  if ((!Object.keys(delta).length && !comparison) || /下周|周[一二三四五六日天]|下个月/.test(message) || (!delta.cityName && /(?:去|在|到).{2,12}(?:旅游|旅行|举办)/.test(message))) {
    try {
      const config = await resolveAccountModelConfig(request);
      const result = await callLlm({
        system: "你是规划需求提取器。只提取本条消息明确给出的事实，不能补全城市、日期、人数、人群等默认值。只输出JSON。",
        prompt: [
          "当前北京时间日期：" + today,
          "用户之前已确认：" + JSON.stringify(known),
          "最近对话（只用于理解省略，不把系统默认值当用户选择）：" + JSON.stringify((body.history ?? []).slice(-6)),
          "本条消息：" + message,
          '输出 {"patch":{}}，可用字段 cityName,activityType,date,endDate,tripDays,startHour,duration,participants,intensity,group,audienceDescription,budgetPerPerson,equipmentCount,teamSize。未提及字段不要输出。大学生等具体身份用audienceDescription保留，预算为人均元，器材为件/套，teamSize为每组人数。',
          "activityType只能为校园运动会、体育课、社区活动、户外训练、研学活动、旅游规划；intensity为低强度、中强度、高强度；group为普通人群、儿童青少年、老年人、敏感人群、外来旅游人群。",
          "三天旅游只输出tripDays:3和activityType，不输出任何日期城市。只说杭州就只输出cityName。日期使用YYYY-MM-DD。",
        ].join("\n"), config,
      });
      const parsed = extractJson<{ patch?: IntakePatch }>(result.text);
      delta = { ...cleanIntake(parsed?.patch), ...delta };
      provider = result.provider + " · " + result.model;
    } catch { provider = "对话条件确认 · 本地解析"; }
  }
  return NextResponse.json({ ...completeIntake(known, delta, today), provider, knowledgeContext: {}, weatherContext: savedWeather, activeTopic: "planning", visualization: comparison ? "compare-days" : undefined });
}
