import { candidateCityTopic, cityInDestinationQuestion, cityIntroductionQuery, cityProfiles, selectCityIntroductionSources, regionalCitySources } from "./city-introduction";
import { audienceGuides, cleanDestinationContext, describeDestinationPreferences, destinationPreferences, rankDestinationPlaces, type DestinationContext, type DestinationPlace } from "./destination-knowledge";
import { CITY_POIS, poisForCity } from "./poi";
import { searchKnowledge, type SocialItem } from "./social-research";
import type { DirectAnswer, AnswerSource } from "./conversation-answer";
import { nationalLocations } from "./national-environment";

interface Region { name: string; adcode: string; center: string; level?: string }
interface DestinationAnswer extends DirectAnswer { knowledgeContext: DestinationContext }
const regionCache = new Map<string, { until: number; value: Region | null }>();
const placeCache = new Map<string, { until: number; value: DestinationPlace[] }>();

async function resolveRegion(subject: string): Promise<Region | null> {
  const cached = regionCache.get(subject);
  if (cached && cached.until > Date.now()) return cached.value;
  const key = process.env.AMAP_WEB_SERVICE_KEY || process.env.NEXT_PUBLIC_AMAP_KEY;
  if (!key) return null;
  const query = new URLSearchParams({ key, keywords: subject, subdistrict: "0", extensions: "base" });
  try {
    const response = await fetch(`https://restapi.amap.com/v3/config/district?${query}`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const data = await response.json() as { status?: string; districts?: Region[] };
    const rows = data.status === "1" && Array.isArray(data.districts) ? data.districts : [];
    const exact = rows.filter((row) => row.name === subject || row.name === `${subject}市` || row.name === `${subject}特别行政区`);
    const row = exact.length === 1 ? exact[0] : rows.length === 1 && rows[0].name.replace(/(?:市|县|区)$/, "") === subject.replace(/(?:市|县|区)$/, "") ? rows[0] : null;
    const value = row && /^\d{6}$/.test(row.adcode) && typeof row.center === "string" ? row : null;
    if (regionCache.size >= 200) regionCache.delete(regionCache.keys().next().value!);
    regionCache.set(subject, { until: Date.now() + (value ? 3600000 : 300000), value });
    return value;
  } catch { return null; }
}

async function readPlaces(region: Region, context: DestinationContext): Promise<DestinationPlace[]> {
  const groups = context.audiences?.length ? context.audiences : ["adult"] as const;
  const keywords = context.focus === "food" ? ["特色小吃", "本地菜"] : context.indoor ? ["博物馆", "科技馆", "美术馆"] : [...new Set(groups.flatMap((key) => audienceGuides[key].keywords.split(" ")))];
  const key = process.env.AMAP_WEB_SERVICE_KEY || process.env.NEXT_PUBLIC_AMAP_KEY;
  if (!key) return [];
  const prefix = region.adcode.endsWith("0000") ? region.adcode.slice(0, 2) : region.adcode.endsWith("00") ? region.adcode.slice(0, 4) : region.adcode;
  const batches = await Promise.all(keywords.slice(0, 4).map(async (keyword) => {
    const cacheKey = `${region.adcode}:${keyword}`;
    const cached = placeCache.get(cacheKey);
    if (cached && cached.until > Date.now()) return cached.value;
    try {
      const query = new URLSearchParams({ key, keywords: keyword, city: region.adcode, citylimit: "true", extensions: "all", offset: "8", page: "1" });
      const response = await fetch(`https://restapi.amap.com/v3/place/text?${query}`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
      if (!response.ok) return [];
      const data = await response.json() as { status?: string; pois?: Array<{ name?: string; type?: string; adcode?: string; address?: string | string[] }> };
      if (data.status !== "1" || !Array.isArray(data.pois)) return [];
      const places = data.pois.filter((item) => typeof item.name === "string" && item.adcode?.startsWith(prefix)
        && !/公交|地铁|车站|停车场|售票处|出入口|办公室|便利店|超市/.test(item.name)
        && !(typeof item.address === "string" && /有限公司|企业内部/.test(item.address))
        && (context.focus === "food" || /博物馆|科技馆|美术馆|纪念馆|展览|文化馆|生态馆|公园|园林|历史.*街区|古城|古镇|风景区|景区|湿地|故里|故居|遗址|古街|老街/.test(item.name))
        && (context.focus === "food" ? /餐饮/.test(item.type || "") : /科教|风景名胜|公园|博物馆|科技馆|美术馆|纪念馆|展览/.test(item.type || "")))
        .map((item) => ({ name: item.name!.slice(0, 100), tag: item.type || keyword, ...(typeof item.address === "string" ? { address: item.address.slice(0, 200) } : {}), source: "高德城市限定地点检索" }));
      if (placeCache.size >= 200) placeCache.delete(placeCache.keys().next().value!);
      if (places.length) placeCache.set(cacheKey, { until: Date.now() + 3600000, value: places });
      return places;
    } catch { return []; }
  }));
  return [...new Map(batches.flat().map((place) => [place.name, place])).values()];
}

function excerptFor(items: SocialItem[], pattern: RegExp): string {
  for (const [index, item] of items.entries()) {
    const sentences = item.excerpt.split(/(?<=[。！？])/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length >= 10 && sentence.length <= 180 && pattern.test(sentence) && !/本文|小编|将为您|文末|小九|为你推荐|带你|精彩攻略/.test(sentence));
    if (sentences.length) return `${sentences.slice(0, 2).join("")} [${index + 1}]`;
  }
  return "当前资料尚不足以可靠补充这一部分，可以继续检索官方介绍。";
}

function sourceList(items: SocialItem[], hasPlaces: boolean): AnswerSource[] {
  return [...items.map((item) => ({ title: item.title, url: item.url, detail: `搜索摘要 · ${item.retrievedAt}；未核验全文` })),
    ...(hasPlaces ? [{ title: "高德地点检索说明", url: "https://lbs.amap.com/api/webservice/guide/api/search", detail: "按行政区代码限定候选；不包含开放、票价或无障碍核验" }] : [])];
}

function venueReason(place: DestinationPlace): string {
  const text = `${place.name} ${place.tag}`;
  if (/科技馆|自然/.test(text)) return "可围绕观察与探索组织参观，具体展项和年龄限制需核实。";
  if (/博物馆|美术馆|展览|纪念馆/.test(text)) return "以展陈参观为主，可选择部分展区，不必一次看完；参观距离、座椅与电梯待核实。";
  if (/公园|园林/.test(text)) return "可考虑短程休闲与自然观察，先选合适入口及路线，避免默认走完整个园区。";
  return "可结合城市文化兴趣分段游览，实际距离、台阶和休息条件需提前确认。";
}

export async function answerDestination(message: string, rawContext: unknown, planningCity?: string): Promise<DestinationAnswer | null> {
  const context = destinationPreferences(message, cleanDestinationContext(rawContext));
  const compare = /不同人群|各类人群|按人群|分别推荐|对比.*人群/.test(message);
  const introduction = candidateCityTopic(message);
  const explicitCity = cityInDestinationQuestion(message) || introduction;
  const global = /哪些城市|什么城市|哪个城市适合|全国|换个城市|其他城市/.test(message);
  if (global) delete context.city;
  const requestedCity = global ? undefined : explicitCity || context.city || planningCity;
  const isIntro = Boolean(introduction) && !/适合|推荐|去哪|哪里/.test(message)
    && !(context.topic === "recommendation" && context.audiences?.length && !/介绍|简介|概况/.test(message));
  if (isIntro) delete context.focus;
  context.topic = isIntro ? "introduction" : "recommendation";
  if (!requestedCity) {
    if (compare) return { reply: "可以分别比较亲子、学生、老人和有无障碍需求的同行者，给出不同地点与理由。你想了解哪个城市？如果还没确定目的地，也可以先告诉我出发地和预算，再比较城市方向。", sources: [], kind: "确认推荐范围", knowledgeContext: context };
    if (!context.audiences?.length) return { reply: "可以按同行人群帮你选地方。是亲子家庭、学生、老人，还是需要无障碍条件的同行者？目的地已确定吗，还是希望先比较几个城市？", sources: [], kind: "确认推荐需求", knowledgeContext: context };
    const options = Object.entries(CITY_POIS).flatMap(([city, rows]) => {
      const ranked = rankDestinationPlaces(rows.map((row) => ({ name: row.name, tag: row.tag })), context);
      return ranked.length ? [{ city, place: ranked[0] }] : [];
    }).slice(0, 3);
    return { reply: `可以先从这些城市方向比较（${describeDestinationPreferences(context)}）：\n\n${options.map((item, i) => `${i + 1}. ${item.city}：可进一步考察${item.place.name}等候选。${venueReason(item.place)}`).join("\n\n")}\n\n这是按内置地点类别做的初筛，尚未核实当日开放、费用或设施，也没有比较交通成本。你从哪里出发、准备去哪个城市？选定后我会查询当地候选并继续细化。`, sources: [{ title: "行知城市地点候选库", detail: "按类别初筛，不代表适宜度认证或实时排名" }], kind: "目的地初筛", knowledgeContext: context };
  }
  const region = await resolveRegion(requestedCity);
  if (!region) {
    if (introduction && !cityInDestinationQuestion(message) && !/介绍|市|县|区/.test(message)) return null;
    return { reply: `暂时无法唯一确认“${requestedCity}”的行政区域，请补充完整城市名或省份；不会覆盖之前确认的城市或混入其他城市的推荐。`, sources: [], kind: "确认目的地", knowledgeContext: context };
  }
  context.city = region.name;
  if (isIntro) {
    const profile = cityProfiles[region.name.replace(/市$/, "")];
    if (profile) return { reply: profile.reply, sources: profile.sources, kind: "城市介绍", knowledgeContext: context };
  }
  const focused = context.focus === "history" ? "历史文化 城市历史 官方简介" : context.focus === "food" ? "特色美食 小吃 饮食文化 官方介绍" : "旅游景点 官方介绍";
  const province = nationalLocations.find((row) => row[0].slice(0, 2) === region.adcode.slice(0, 2))?.[1] || "中国";
  const query = `${province} ` + (isIntro ? cityIntroductionQuery(region.name) : context.focus ? `${region.name} ${focused}` : `${region.name} ${describeDestinationPreferences(context)} 适合参观的博物馆 公园 官方介绍`);
  const searches = async () => {
    if (!isIntro) return searchKnowledge(query);
    const batches = await Promise.allSettled([searchKnowledge(`${province} ${region.name} 市情概况 历史文化 官方`), searchKnowledge(`${province} ${region.name} 特色美食 代表景点 介绍`)]);
    return [...new Map(batches.flatMap((item) => item.status === "fulfilled" ? item.value : []).map((item) => [item.url, item])).values()].slice(0, 8);
  };
  const [searched, live] = await Promise.allSettled([searches(), readPlaces(region, compare ? { ...context, audiences: ["family", "student", "senior", "accessible"] } : context)]);
  const found = searched.status === "fulfilled" ? searched.value : [];
  const regional = regionalCitySources(found, region.name, province);
  const items = isIntro ? selectCityIntroductionSources(regional, region.name) : regional;
  const places = live.status === "fulfilled" ? live.value : [];
  const builtIn: DestinationPlace[] = poisForCity(region.name).map((place) => ({ name: place.name, tag: place.tag, source: "内置地点候选，未实时核验" }));
  const candidates = places.length ? places : builtIn;
  const sources = sourceList(items, places.length > 0);
  if (!places.length && builtIn.length) sources.push({ title: "行知城市地点候选库", detail: "本次实时地点查询未返回可用结果，内置候选待核实" });
  if (isIntro) {
    const sights = candidates.slice(0, 4);
    return { reply: `${region.name}｜城市认识指南\n\n城市概况\n${excerptFor(items, /位于|地处|省会|古称|城市|中心/)}\n\n历史与文化\n${excerptFor(items, /历史|文化|古都|遗址|古称|博物馆/)}\n\n可以了解的地点\n${sights.length ? sights.map((place, i) => `${i + 1}. ${place.name}（${place.tag.split(";").slice(-1)[0]}）。`).join("\n") : "暂未获得可核对的当地地点，不能为你编造景点。"}\n\n饮食与本地生活\n${excerptFor(items, /美食|饮食|小吃|菜肴|菜系|面食/)}\n\n以上按公开摘要和地点类别整理，不包含实时票价、营业或预约承诺。你更想了解历史、美食，还是针对同行人群推荐去处？`, sources, kind: "城市介绍", knowledgeContext: context };
  }
  if (!compare && (context.focus === "history" || context.focus === "food" || (context.focus === "sights" && !context.audiences?.length))) {
    const heading = context.focus === "history" ? "历史与文化" : context.focus === "food" ? "美食与本地生活" : "游览去处";
    const pattern = context.focus === "history" ? /历史|文化|古都|遗址|古称/ : context.focus === "food" ? /饮食|美食|小吃|菜系|面食|菜肴/ : /景点|游览|公园|博物馆|文化/;
    const choices = context.focus === "food" ? places : candidates;
    return { reply: `${region.name}｜${heading}\n\n${excerptFor(items, pattern)}\n\n${choices.length ? `可进一步了解的${context.focus === "food" ? "餐饮" : "地点"}候选：\n${choices.slice(0, 4).map((place, i) => `${i + 1}. ${place.name}${place.address ? `（${place.address}）` : ""}`).join("\n")}` : "当前没有获得可核对的相关地点，不补写未经核实的名单。"}\n\n这是公开摘要与地点检索资料的整理。${context.focus === "food" ? "餐饮候选不代表口味、卫生或过敏适用保证，价格与营业状态需核实。" : "如要按同行者推荐，可以告诉我人群、预算和步行需求。"}`, sources, kind: "城市专题", knowledgeContext: context };
  }
  if (compare) {
    const groups = ["family", "student", "senior", "accessible"] as const;
    return { reply: `${region.name}｜不同人群的选地思路\n\n${groups.map((key) => {
      const selected = rankDestinationPlaces(candidates, { ...context, audiences: [key] }).slice(0, 2);
      return `${audienceGuides[key].label}\n${selected.length ? selected.map((place) => `· ${place.name}：${venueReason(place)}`).join("\n") : "暂无符合条件的可靠候选。"}\n需要确认：${audienceGuides[key].checks}`;
    }).join("\n\n")}\n\n这是基于地点类别的候选初筛，不是场馆适宜性或无障碍认证。你想按哪类人群继续，是否还有年龄、预算或步行限制？`, sources, kind: "人群对比", knowledgeContext: context };
  }
  if (!context.audiences?.length) return { reply: `已确定目的地为${region.name}。这次为哪类同行者推荐：亲子、学生、老人、普通成年人，还是需要无障碍条件的人？也可以一起告诉我孩子年龄、能走多久、预算和室内外偏好。`, sources, kind: "确认同行需求", knowledgeContext: context };
  const ranked = rankDestinationPlaces(/换一批|还有别的|别的地方/.test(message) ? candidates.filter((place) => !context.lastPlaces?.includes(place.name)) : candidates, context);
  context.lastPlaces = ranked.map((place) => place.name);
  const checks = context.audiences.map((key) => audienceGuides[key].checks).join("\n");
  const principles = context.audiences.map((key) => audienceGuides[key].reason).join("\n");
  return { reply: `${region.name}｜按同行需求筛选\n${describeDestinationPreferences(context)}\n\n筛选方向：${principles}\n\n${ranked.length ? ranked.map((place, i) => `${i + 1}. ${place.name}\n推荐考虑理由：${venueReason(place)}${place.address ? `\n地点：${place.address}` : ""}\n依据：${place.source || "地点类别初筛"}；适合程度需结合实际需求确认。`).join("\n\n") : "本次没有找到同时符合条件的可靠候选，不会用不相关地点凑数。可以放宽室内条件、换一个区县，或说明你已考虑的地点。"}\n\n继续细化前\n${checks}\n${context.indoor ? "已按室内场馆类别筛选；具体展区是否在室内仍需向场馆确认。" : "天气与开放信息尚未核实，确定日期后可以继续查询。"}${context.lowBudget ? "\n费用未核实，不能保证这些地点免费或有优惠。" : ""}\n\n${context.audiences.includes("family") && context.childAge === undefined ? "孩子大约几岁？" : context.audiences.some((key) => ["senior", "accessible"].includes(key)) ? "同行者能连续步行多久，是否必须全程无台阶？" : "你更偏好历史文化、自然休闲，还是本地美食？"}`, sources, kind: "人群推荐", knowledgeContext: context };
}
