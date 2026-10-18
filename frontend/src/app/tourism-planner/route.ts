import { NextResponse } from "next/server";
import { callLlm, extractJson } from "@/lib/llm-server";
import { poisForCity, DEFAULT_STOP_TIMES, type PoiSpot } from "@/lib/poi";
import type { TourismHourSnapshot, TourismRequestPayload } from "@/lib/tourism";
import type { TourismRoute, TourismStop } from "@/lib/types";

export const maxDuration = 60;
type TourismRequestBody = TourismRequestPayload;
interface LlmStopPlan { name?: string; time?: string; tip?: string }
interface LlmRoutePlan { summary?: string; bestHours?: string; stops?: LlmStopPlan[]; notes?: string[] }
interface AmapPoi { location?: string; address?: string | string[]; photos?: Array<{ url?: string }> }

function poiCategory(poi: PoiSpot): "景点" | "美食" {
  if (poi.category) return poi.category;
  return /美食|小吃|餐|菜|茶食/.test(`${poi.tag}${poi.name}`) ? "美食" : "景点";
}

function comfortIndex(hour: TourismHourSnapshot): number {
  return 100 - hour.heatRisk * 0.42 - Math.max(0, hour.aqi - 35) * 0.21 - hour.rainProbability * 0.18;
}

function bestHoursText(hours: TourismHourSnapshot[]): string {
  if (!hours.length) return "全天时段均可安排";
  const daylight = hours.filter((hour) => hour.hour >= 8 && hour.hour <= 20);
  return (daylight.length ? daylight : hours).slice().sort((a, b) => comfortIndex(b) - comfortIndex(a))
    .slice(0, 4).sort((a, b) => a.hour - b.hour)
    .map((hour) => `${String(hour.hour).padStart(2, "0")}:00 前后`).join("、");
}

function platformLinks(cityName: string, poi: PoiSpot, longitude: number, latitude: number): TourismStop["links"] {
  const keyword = encodeURIComponent(`${cityName} ${poi.name} 攻略`);
  const links: TourismStop["links"] = [
    { label: "抖音攻略", kind: "douyin", url: `https://www.douyin.com/search/${keyword}` },
    { label: "小红书笔记", kind: "xiaohongshu", url: `https://www.xiaohongshu.com/search_result?keyword=${keyword}` },
    { label: "高德导航", kind: "map", url: `https://uri.amap.com/marker?position=${longitude},${latitude}&name=${encodeURIComponent(poi.name)}&src=shihou` },
  ];
  if (poi.sourceUrl) links.push({ label: "官方资料", kind: "source", url: poi.sourceUrl });
  return links;
}

async function enrichStop(cityName: string, poi: PoiSpot, time: string, tip?: string): Promise<TourismStop> {
  let longitude = poi.longitude;
  let latitude = poi.latitude;
  let address: string | undefined;
  let imageUrl: string | undefined;
  const key = process.env.AMAP_WEB_SERVICE_KEY || process.env.NEXT_PUBLIC_AMAP_KEY;
  if (key) {
    try {
      const query = new URLSearchParams({ key, keywords: poi.searchKeyword || poi.name, city: cityName, citylimit: "true", extensions: "all", offset: "1", page: "1" });
      const response = await fetch(`https://restapi.amap.com/v3/place/text?${query}`, { signal: AbortSignal.timeout(3500), next: { revalidate: 86400 } });
      const data = await response.json() as { status?: string; pois?: AmapPoi[] };
      const result = data.status === "1" ? data.pois?.[0] : undefined;
      const [lng, lat] = String(result?.location ?? "").split(",").map(Number);
      if (Number.isFinite(lng) && Number.isFinite(lat)) { longitude = lng; latitude = lat; }
      address = typeof result?.address === "string" ? result.address : undefined;
      imageUrl = result?.photos?.find((photo) => typeof photo.url === "string")?.url?.replace(/^http:/, "https:");
    } catch { /* 内置坐标与文字仍可保证路线可用 */ }
  }
  return {
    name: poi.name, longitude, latitude, time, tip: tip?.trim() || poi.blurb, tag: poi.tag,
    category: poiCategory(poi), address, imageUrl,
    articleTitle: poi.sourceTitle || `${poi.name}游玩提示`, articleUrl: poi.sourceUrl,
    links: platformLinks(cityName, poi, longitude, latitude),
  };
}

function curatedPois(pois: PoiSpot[]): PoiSpot[] {
  const sights = pois.filter((poi) => poiCategory(poi) === "景点");
  const foods = pois.filter((poi) => poiCategory(poi) === "美食");
  return [sights[0], sights[1], foods[0], sights[2], foods[1], sights[3]]
    .filter((poi): poi is PoiSpot => Boolean(poi))
    .filter((poi, index, list) => list.findIndex((candidate) => candidate.name === poi.name) === index).slice(0, 6);
}

async function fallbackRoute(body: TourismRequestBody): Promise<TourismRoute> {
  const stops = await Promise.all(curatedPois(poisForCity(body.cityName)).map((poi, index) => enrichStop(body.cityName, poi, DEFAULT_STOP_TIMES[index] ?? "19:00")));
  return {
    cityName: body.cityName, date: body.date,
    summary: stops.length ? `${body.cityName}一日路线串联代表景点与本地美食，按上午游览、中午用餐、下午体验、傍晚街区的节奏编排，并结合逐小时天气调整户外停留。` : `${body.cityName}暂无完整候选库，建议优先选择城市历史街区、公共文化场馆与本地餐饮集中区。`,
    bestHours: bestHoursText(body.hours ?? []), stops,
    notes: ["推荐参考公开文旅资料，并提供抖音、小红书关键词检索入口；平台热度会变化，不代表实时排名。", "图片与地址来自高德公开 POI 信息，出发前请再次确认营业时间、预约和交通状态。"],
    generatedBy: "curated",
  };
}

export async function POST(request: Request) {
  let body: TourismRequestBody;
  try { body = await request.json() as TourismRequestBody; }
  catch { return NextResponse.json({ detail: "请求体不是合法 JSON" }, { status: 400 }); }
  if (!body.cityName || !body.date) return NextResponse.json({ detail: "缺少城市或日期参数" }, { status: 400 });

  const pois = poisForCity(body.cityName);
  const weatherSummary = (body.hours ?? []).filter((hour) => hour.hour >= 8 && hour.hour <= 21)
    .map((hour) => `${hour.hour}时 ${hour.temperature}°C 湿度${hour.humidity}% 降水${hour.rainProbability}% AQI${hour.aqi} 热风险${hour.heatRisk}`).join("；");
  const system = "你是严谨的城市旅游路线规划师。只输出一个 JSON 对象，不要输出解释或代码块。";
  const prompt = [
    `请为${body.cityName}（${body.province ?? "中国"}）${body.date}的一日游规划路线。`,
    "路线必须同时包含代表性景点和本地美食，兼顾相邻地点、用餐时间与逐小时天气。",
    weatherSummary ? `逐小时天气：${weatherSummary}。` : "",
    pois.length ? `候选地点（只能从中选择且名称必须一致）：${pois.map((poi) => `${poi.name}[${poiCategory(poi)}·${poi.tag}]`).join("、")}。` : "",
    `输出：{"summary":"路线概述","bestHours":"推荐时段","stops":[{"name":"地点名","time":"HH:MM","tip":"20-40字具体建议"}],"notes":["2-3条注意事项"]}`,
    "选择 5-6 站，其中至少 2 个美食站和 3 个景点；按实际游览顺序排列。",
  ].filter(Boolean).join("\n");

  try {
    const result = await callLlm({ system, prompt, config: body.config });
    const plan = extractJson<LlmRoutePlan>(result.text);
    const chosen: Array<{ poi: PoiSpot; time: string; tip?: string }> = [];
    for (const [index, stop] of (Array.isArray(plan?.stops) ? plan.stops.slice(0, 6) : []).entries()) {
      const name = stop.name?.trim();
      if (!name) continue;
      const poi = pois.find((candidate) => candidate.name === name || candidate.name.includes(name) || name.includes(candidate.name));
      if (poi && !chosen.some((item) => item.poi.name === poi.name)) chosen.push({ poi, time: stop.time?.trim() || DEFAULT_STOP_TIMES[index] || "19:00", tip: stop.tip });
    }
    for (const food of pois.filter((poi) => poiCategory(poi) === "美食")) {
      const foodCount = chosen.filter((item) => poiCategory(item.poi) === "美食").length;
      if (foodCount >= 2) break;
      if (chosen.some((item) => item.poi.name === food.name)) continue;
      if (chosen.length >= 6) {
        const replaceIndex = chosen.findLastIndex((item) => poiCategory(item.poi) === "景点");
        if (replaceIndex >= 0) chosen.splice(replaceIndex, 1);
      }
      chosen.push({ poi: food, time: foodCount === 0 ? "12:00" : "18:30" });
    }
    for (const poi of curatedPois(pois)) {
      if (chosen.length >= 6 || chosen.some((item) => item.poi.name === poi.name)) continue;
      chosen.push({ poi, time: DEFAULT_STOP_TIMES[chosen.length] ?? "19:00" });
    }
    if (chosen.length < 3) return NextResponse.json({ ...(await fallbackRoute(body)), provider: result.provider });
    chosen.sort((a, b) => a.time.localeCompare(b.time));
    const stops = await Promise.all(chosen.map((item) => enrichStop(body.cityName, item.poi, item.time, item.tip)));
    return NextResponse.json({
      cityName: body.cityName, date: body.date,
      summary: plan?.summary?.trim() || `${body.cityName}景点与美食一日路线，结合当日天气编排。`,
      bestHours: plan?.bestHours?.trim() || bestHoursText(body.hours ?? []), stops,
      notes: [...(Array.isArray(plan?.notes) ? plan.notes.slice(0, 2).map(String) : []), "抖音、小红书按钮打开对应关键词的实时检索结果，平台内容与热度由平台更新。"],
      generatedBy: "llm", provider: `${result.provider} · ${result.model}`,
    } satisfies TourismRoute);
  } catch { return NextResponse.json(await fallbackRoute(body)); }
}
