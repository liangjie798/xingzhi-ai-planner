import { NextResponse } from "next/server";
import { callLlm, extractJson } from "@/lib/llm-server";
import { poisForCity, DEFAULT_STOP_TIMES } from "@/lib/poi";
import type { TourismHourSnapshot, TourismRequestPayload } from "@/lib/tourism";
import type { TourismRoute, TourismStop } from "@/lib/types";

export const maxDuration = 60;

type TourismRequestBody = TourismRequestPayload;

interface LlmStopPlan {
  name?: string;
  time?: string;
  tip?: string;
}

interface LlmRoutePlan {
  summary?: string;
  bestHours?: string;
  stops?: LlmStopPlan[];
  notes?: string[];
}

function comfortIndex(hour: TourismHourSnapshot): number {
  return 100 - hour.heatRisk * 0.42 - Math.max(0, hour.aqi - 35) * 0.21 - hour.rainProbability * 0.18;
}

function bestHoursText(hours: TourismHourSnapshot[]): string {
  if (!hours.length) return "全天时段均可安排";
  const daylight = hours.filter((hour) => hour.hour >= 8 && hour.hour <= 20);
  const ranked = (daylight.length ? daylight : hours)
    .slice()
    .sort((a, b) => comfortIndex(b) - comfortIndex(a))
    .slice(0, 4)
    .sort((a, b) => a.hour - b.hour);
  return ranked.map((hour) => `${String(hour.hour).padStart(2, "0")}:00 前后`).join("、");
}

function fallbackRoute(body: TourismRequestBody): TourismRoute {
  const pois = poisForCity(body.cityName);
  const stops: TourismStop[] = pois.slice(0, 5).map((poi, index) => ({
    name: poi.name,
    longitude: poi.longitude,
    latitude: poi.latitude,
    time: DEFAULT_STOP_TIMES[index] ?? "19:00",
    tip: poi.blurb,
    tag: poi.tag,
  }));
  return {
    cityName: body.cityName,
    date: body.date,
    summary: stops.length
      ? `${body.cityName}经典一日路线：串联打卡热度最高、体验差异最大的 5 处地标，顺序按"上午人文、下午自然、傍晚夜景"编排，并避开正午高温时段。`
      : `${body.cityName}暂无内置景点库，已生成通用建议：优先选择城市核心历史文化街区与滨水步道，避开正午高温与降雨高峰时段。`,
    bestHours: bestHoursText(body.hours ?? []),
    stops,
    notes: [
      "路线基于内置公开景点候选库，并结合当日逐小时天气预报排序，不代表实时热度排名。",
      "热门景点多需提前 1-3 天线上预约，出行前请确认门票与开放时间。",
    ],
    generatedBy: "curated",
  };
}

export async function POST(request: Request) {
  let body: TourismRequestBody;
  try {
    body = await request.json() as TourismRequestBody;
  } catch {
    return NextResponse.json({ detail: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!body.cityName || !body.date) {
    return NextResponse.json({ detail: "缺少城市或日期参数" }, { status: 400 });
  }

  const pois = poisForCity(body.cityName);
  const weatherSummary = (body.hours ?? [])
    .filter((hour) => hour.hour >= 8 && hour.hour <= 21)
    .map((hour) => `${hour.hour}时 ${hour.temperature}°C 湿度${hour.humidity}% 降水概率${hour.rainProbability}% AQI${hour.aqi} 热风险${hour.heatRisk}`)
    .join("；");

  const system = "你是一名字数严谨的旅游路线规划师。只输出一个 JSON 对象，不要输出任何其他文字、解释或代码块围栏。";
  const prompt = [
    `请为前往${body.cityName}（${body.province ?? "中国"}）的${body.date}一日游游客规划路线。该用户群体为"外来旅游人群"。`,
    `推荐内容需从公开景点候选库中兼顾代表性与体验差异，并结合当日逐小时天气把户外停留安排在舒适时段。`,
    weatherSummary ? `当日逐小时天气：${weatherSummary}。` : "",
    pois.length
      ? `候选景点（只能从中选择，name 必须与候选完全一致）：${pois.map((poi) => `${poi.name}[${poi.tag}]`).join("、")}。`
      : `候选景点：请基于你的知识推荐${body.cityName}最具代表性的 5 个景点，并给出 name。`,
    `输出 JSON 结构：{"summary":"整体路线一句话概述","bestHours":"推荐出行时段（如 09:00 前后、15:00 前后）","stops":[{"name":"景点名","time":"到达时间 HH:MM","tip":"20-40字的游玩建议，含避坑/机位/预约提醒"}],"notes":["2-3条出行注意事项"]}`,
    pois.length ? "从候选中选择 5 个景点并给出合理顺序（上午-中午-下午-傍晚-夜晚）。" : "推荐 5 个景点并给出合理顺序。",
  ].filter(Boolean).join("\n");

  try {
    const result = await callLlm({ system, prompt, config: body.config });
    const plan = extractJson<LlmRoutePlan>(result.text);
    const nameToPoi = new Map(pois.map((poi) => [poi.name, poi]));

    const stops: TourismStop[] = [];
    const planStops = Array.isArray(plan?.stops) ? plan.stops.slice(0, 6) : [];
    for (const [index, stop] of planStops.entries()) {
      const name = stop.name?.trim();
      if (!name) continue;
      const poi = nameToPoi.get(name) ?? pois.find((candidate) => candidate.name.includes(name) || name.includes(candidate.name));
      stops.push({
        name: poi?.name ?? name,
        longitude: poi?.longitude ?? body.longitude ?? null,
        latitude: poi?.latitude ?? body.latitude ?? null,
        time: stop.time?.trim() || DEFAULT_STOP_TIMES[index] || "19:00",
        tip: stop.tip?.trim() || poi?.blurb || "",
        tag: poi?.tag ?? "AI 推荐",
      });
    }

    if (stops.length < 3) {
      return NextResponse.json({ ...fallbackRoute(body), provider: result.provider });
    }

    return NextResponse.json({
      cityName: body.cityName,
      date: body.date,
      summary: plan?.summary?.trim() || `${body.cityName}一日游路线，结合当日天气与热门平台推荐编排。`,
      bestHours: plan?.bestHours?.trim() || bestHoursText(body.hours ?? []),
      stops,
      notes: Array.isArray(plan?.notes) && plan.notes.length ? plan.notes.slice(0, 4).map(String) : fallbackRoute(body).notes,
      generatedBy: "llm",
      provider: `${result.provider} · ${result.model}`,
    } satisfies TourismRoute);
  } catch {
    return NextResponse.json(fallbackRoute(body));
  }
}
