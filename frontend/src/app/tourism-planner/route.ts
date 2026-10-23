import { NextResponse } from "next/server";
import { callLlm, extractJson } from "@/lib/llm-server";
import { poisForCity, type PoiSpot } from "@/lib/poi";
import type { TourismHourSnapshot, TourismRequestPayload } from "@/lib/tourism";
import type { EvidenceItem, ToolTraceItem, TourismRoute, TourismStop } from "@/lib/types";
import { resolveAccountModelConfig } from "@/lib/account-model-config-server";

export const maxDuration = 60;
type TourismRequestBody = TourismRequestPayload;
interface LlmStopPlan { name?: string; time?: string; tip?: string; day?: number }
interface LlmRoutePlan { summary?: string; bestHours?: string; stops?: LlmStopPlan[]; notes?: string[] }
interface AmapPoi { name?: string; type?: string; location?: string; address?: string | string[]; photos?: Array<{ url?: string }> }

const DAY_TIMES = ["09:00", "11:30", "14:30", "18:00"];

function tripDates(start: string, end?: string): string[] {
  const first = new Date(`${start}T00:00:00+08:00`);
  const last = new Date(`${end || start}T00:00:00+08:00`);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime()) || last < first) return [start];
  const dates: string[] = [];
  for (let cursor = first; cursor <= last && dates.length < 7; cursor = new Date(cursor.getTime() + 86400000)) {
    dates.push(cursor.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }));
  }
  return dates.length ? dates : [start];
}

function cleanCityName(cityName: string): string {
  return cityName.split(/[·（(]/)[0].replace(/特别行政区$/, "").trim();
}

function amapCategory(poi: AmapPoi, requested: "景点" | "美食"): "景点" | "美食" {
  return requested === "美食" || /餐饮|美食|小吃|咖啡|茶/.test(`${poi.type ?? ""}${poi.name ?? ""}`) ? "美食" : "景点";
}

async function livePois(body: TourismRequestBody): Promise<PoiSpot[]> {
  const key = process.env.AMAP_WEB_SERVICE_KEY || process.env.NEXT_PUBLIC_AMAP_KEY;
  if (!key) return [];
  const city = cleanCityName(body.cityName);
  const requests: Array<{ keyword: string; category: "景点" | "美食" }> = [
    { keyword: "旅游景点", category: "景点" }, { keyword: "博物馆", category: "景点" },
    { keyword: "公园", category: "景点" }, { keyword: "特色美食", category: "美食" },
    { keyword: "本地菜", category: "美食" },
  ];
  const batches = await Promise.all(requests.map(async ({ keyword, category }) => {
    try {
      const query = new URLSearchParams({ key, keywords: `${city}${keyword}`, city, citylimit: "true", extensions: "all", offset: "10", page: "1" });
      const response = await fetch(`https://restapi.amap.com/v3/place/text?${query}`, { signal: AbortSignal.timeout(5000), next: { revalidate: 86400 } });
      const data = await response.json() as { status?: string; pois?: AmapPoi[] };
      return (data.status === "1" ? data.pois ?? [] : []).map((poi): PoiSpot | null => {
        const [longitude, latitude] = String(poi.location ?? "").split(",").map(Number);
        if (!poi.name || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
        const resolvedCategory = amapCategory(poi, category);
        return {
          name: poi.name, longitude, latitude, category: resolvedCategory,
          tag: resolvedCategory === "美食" ? "本地美食" : keyword.replace(city, ""),
          blurb: resolvedCategory === "美食" ? `高德城市限定检索到的${city}餐饮地点，建议结合营业时间与距离安排用餐。` : `高德城市限定检索到的${city}公共游览地点，建议结合天气与开放时间安排。`,
          address: typeof poi.address === "string" ? poi.address : undefined,
          imageUrl: poi.photos?.find((photo) => typeof photo.url === "string")?.url?.replace(/^http:/, "https:"),
        };
      }).filter((poi): poi is PoiSpot => Boolean(poi));
    } catch { return []; }
  }));
  return batches.flat().filter((poi, index, list) => list.findIndex((item) => item.name === poi.name) === index);
}

async function candidatesFor(body: TourismRequestBody): Promise<PoiSpot[]> {
  const builtIn = poisForCity(body.cityName);
  const live = await livePois(body);
  return [...builtIn, ...live].filter((poi, index, list) => list.findIndex((item) => item.name === poi.name) === index);
}

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

async function enrichStop(cityName: string, poi: PoiSpot, time: string, day: number, date: string, tip?: string): Promise<TourismStop> {
  let longitude = poi.longitude;
  let latitude = poi.latitude;
  let address: string | undefined = poi.address;
  let imageUrl: string | undefined = poi.imageUrl;
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
    name: poi.name, longitude, latitude, time, day, date, tip: tip?.trim() || poi.blurb, tag: poi.tag,
    category: poiCategory(poi), address, imageUrl,
    articleTitle: poi.sourceTitle || `${poi.name}游玩提示`, articleUrl: poi.sourceUrl,
    links: platformLinks(cityName, poi, longitude, latitude),
  };
}

function curatedPois(pois: PoiSpot[], limit = 6): PoiSpot[] {
  const sights = pois.filter((poi) => poiCategory(poi) === "景点");
  const foods = pois.filter((poi) => poiCategory(poi) === "美食");
  const interleaved: Array<PoiSpot | undefined> = [];
  const size = Math.max(sights.length, foods.length);
  for (let index = 0; index < size; index += 1) {
    if (sights[index]) interleaved.push(sights[index]);
    if (index % 2 === 0 && foods[Math.floor(index / 2)]) interleaved.push(foods[Math.floor(index / 2)]);
  }
  return interleaved
    .filter((poi): poi is PoiSpot => Boolean(poi))
    .filter((poi, index, list) => list.findIndex((candidate) => candidate.name === poi.name) === index).slice(0, limit);
}

function routeEvidence(stops: TourismStop[]): EvidenceItem[] {
  const official = stops.filter((stop) => stop.articleUrl).filter((stop, index, list) => list.findIndex((item) => item.articleUrl === stop.articleUrl) === index)
    .map((stop, index) => ({ id: `tour-official-${index}`, title: stop.articleTitle || `${stop.name}公开资料`, publisher: "地方公开文旅资料", excerpt: `${stop.name}：${stop.tip}`, tag: "文旅依据", sourceUrl: stop.articleUrl, section: stop.category }));
  return [
    { id: "tour-weather", title: "逐小时天气与环境预报", publisher: "Open-Meteo", excerpt: "路线推荐时段综合气温、湿度、降水概率、空气质量与热风险计算。", tag: "实时数据", sourceUrl: "https://open-meteo.com/", section: "活动日期逐小时预测" },
    { id: "tour-poi", title: "地点坐标、地址与公开图片", publisher: "高德开放平台", excerpt: "路线站点通过城市限定 POI 检索校准坐标、地址和公开图片，地图路径按校准后的坐标绘制。", tag: "地图数据", sourceUrl: "https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch", section: "POI 搜索" },
    ...official,
  ];
}

function routeTrace(hours: number, candidates: number, days: number, generatedBy: "llm" | "curated", modelMs: number, poiMs: number): ToolTraceItem[] {
  return [
    { id: "tour-forecast", name: "读取逐小时环境", detail: `接收 ${hours} 个小时的气温、降水、AQI 与热风险数据，计算推荐出行时段。`, status: "done", durationMs: 0 },
    { id: "tour-retrieve", name: "检索城市候选地点", detail: `从城市候选库筛选 ${candidates} 个景点与美食，并执行类别约束。`, status: candidates ? "done" : "fallback", durationMs: 0 },
    { id: "tour-plan", name: "编排多日游览顺序", detail: generatedBy === "llm" ? `模型在限定候选集内编排 ${days} 日路线、每日用餐时间和天气适配。` : `模型不可用，使用可解释规则生成 ${days} 日路线。`, status: generatedBy === "llm" ? "done" : "fallback", durationMs: modelMs },
    { id: "tour-enrich", name: "校准 POI 与链接", detail: "使用高德 POI 校准地点坐标、地址和图片，并生成导航及内容平台检索入口。", status: "done", durationMs: poiMs },
    { id: "tour-validate", name: "路线约束校验", detail: "检查站点去重、时间顺序，以及景点与美食的最低数量要求。", status: "done", durationMs: 0 },
  ];
}

async function fallbackRoute(body: TourismRequestBody): Promise<TourismRoute> {
  const poiStarted = Date.now();
  const dates = tripDates(body.date, body.endDate);
  const candidates = await candidatesFor(body);
  const selected = curatedPois(candidates, dates.length * DAY_TIMES.length);
  const stops = await Promise.all(selected.map((poi, index) => {
    const day = Math.floor(index / DAY_TIMES.length) + 1;
    return enrichStop(body.cityName, poi, DAY_TIMES[index % DAY_TIMES.length], day, dates[day - 1] ?? dates.at(-1)!);
  }));
  const tripName = dates.length === 1 ? "一日" : `${dates.length}日`;
  return {
    cityName: body.cityName, date: body.date, endDate: dates.at(-1)!, dayCount: dates.length,
    summary: stops.length ? `${body.cityName}${tripName}路线串联代表景点与本地美食，每日按上午游览、中午用餐、下午体验、傍晚街区的节奏编排，并结合逐小时天气调整户外停留。` : `${body.cityName}的公开 POI 暂时不足，请稍后重试或选择更明确的市、区县名称。`,
    bestHours: bestHoursText(body.hours ?? []), stops,
    notes: ["推荐参考公开文旅资料，并提供抖音、小红书关键词检索入口；平台热度会变化，不代表实时排名。", "图片与地址来自高德公开 POI 信息，出发前请再次确认营业时间、预约和交通状态。"],
    generatedBy: "curated",
    evidence: routeEvidence(stops),
    trace: routeTrace(body.hours?.length ?? 0, candidates.length, dates.length, "curated", 0, Date.now() - poiStarted),
  };
}

export async function POST(request: Request) {
  let body: TourismRequestBody;
  try { body = await request.json() as TourismRequestBody; }
  catch { return NextResponse.json({ detail: "请求体不是合法 JSON" }, { status: 400 }); }
  if (!body.cityName || !body.date) return NextResponse.json({ detail: "缺少城市或日期参数" }, { status: 400 });

  const dates = tripDates(body.date, body.endDate);
  const pois = await candidatesFor(body);
  if (pois.length < 3) return NextResponse.json(await fallbackRoute(body));
  const desiredStops = Math.min(pois.length, dates.length * DAY_TIMES.length);
  const weatherSummary = (body.hours ?? []).filter((hour) => hour.hour >= 8 && hour.hour <= 21)
    .map((hour) => `${hour.date} ${hour.hour}时 ${hour.temperature}°C 湿度${hour.humidity}% 降水${hour.rainProbability}% AQI${hour.aqi} 热风险${hour.heatRisk}`).join("；");
  const system = "你是严谨的城市旅游路线规划师。只输出一个 JSON 对象，不要输出解释或代码块。";
  const prompt = [
    `请为${body.cityName}（${body.province ?? "中国"}）规划 ${dates.length} 日路线，日期为 ${dates.join("、")}。`,
    "路线必须每天同时包含代表性景点和本地美食，兼顾相邻地点、用餐时间与当天逐小时天气。",
    weatherSummary ? `逐小时天气：${weatherSummary}。` : "",
    pois.length ? `候选地点（只能从中选择且名称必须一致）：${pois.map((poi) => `${poi.name}[${poiCategory(poi)}·${poi.tag}]`).join("、")}。` : "",
    `输出：{"summary":"路线概述","bestHours":"推荐时段","stops":[{"name":"地点名","day":1,"time":"HH:MM","tip":"20-40字具体建议"}],"notes":["2-3条注意事项"]}`,
    `共选择 ${desiredStops} 站并分配到第 1-${dates.length} 日，每天优先安排 3-4 站并包含正餐；按日期和实际游览顺序排列。`,
  ].filter(Boolean).join("\n");

  try {
    const modelStarted = Date.now();
    const config = await resolveAccountModelConfig(request);
    const result = await callLlm({ system, prompt, config });
    const modelMs = Date.now() - modelStarted;
    const plan = extractJson<LlmRoutePlan>(result.text);
    const chosen: Array<{ poi: PoiSpot; day: number; time: string; tip?: string }> = [];
    for (const [index, stop] of (Array.isArray(plan?.stops) ? plan.stops.slice(0, desiredStops) : []).entries()) {
      const name = stop.name?.trim();
      if (!name) continue;
      const poi = pois.find((candidate) => candidate.name === name || candidate.name.includes(name) || name.includes(candidate.name));
      const day = Math.min(dates.length, Math.max(1, Number(stop.day) || Math.floor(index / DAY_TIMES.length) + 1));
      if (poi && !chosen.some((item) => item.poi.name === poi.name)) chosen.push({ poi, day, time: stop.time?.trim() || DAY_TIMES[index % DAY_TIMES.length], tip: stop.tip });
    }
    for (const poi of curatedPois(pois, desiredStops)) {
      if (chosen.length >= desiredStops || chosen.some((item) => item.poi.name === poi.name)) continue;
      const index = chosen.length;
      chosen.push({ poi, day: Math.min(dates.length, Math.floor(index / DAY_TIMES.length) + 1), time: DAY_TIMES[index % DAY_TIMES.length] });
    }
    if (chosen.length < 3) return NextResponse.json({ ...(await fallbackRoute(body)), provider: result.provider });
    chosen.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
    const poiStarted = Date.now();
    const stops = await Promise.all(chosen.map((item) => enrichStop(body.cityName, item.poi, item.time, item.day, dates[item.day - 1], item.tip)));
    const poiMs = Date.now() - poiStarted;
    return NextResponse.json({
      cityName: body.cityName, date: body.date, endDate: dates.at(-1)!, dayCount: dates.length,
      summary: plan?.summary?.trim() || `${body.cityName}景点与美食${dates.length === 1 ? "一日" : `${dates.length}日`}路线，结合每日天气编排。`,
      bestHours: plan?.bestHours?.trim() || bestHoursText(body.hours ?? []), stops,
      notes: [...(Array.isArray(plan?.notes) ? plan.notes.slice(0, 2).map(String) : []), "抖音、小红书按钮打开对应关键词的实时检索结果，平台内容与热度由平台更新。"],
      generatedBy: "llm", provider: `${result.provider} · ${result.model}`,
      evidence: routeEvidence(stops),
      trace: routeTrace(body.hours?.length ?? 0, pois.length, dates.length, "llm", modelMs, poiMs),
    } satisfies TourismRoute);
  } catch { return NextResponse.json(await fallbackRoute(body)); }
}
