import type { PoiSpot } from "./poi";
import type { ScheduledVisit } from "./tourism-scheduler";
import type { TourismHourSnapshot } from "./tourism";
import { isFood } from "./tourism-scheduler.ts";

/** 推荐理由只使用排程已经算出的距离、时段与天气，不引入新的热度、评分或营业结论。 */
export interface StopReasonContext {
  hours: TourismHourSnapshot[];
  /** 当日第几站，从 1 开始。 */
  position: number;
  /** 当日总站数。 */
  dayTotal: number;
  /** 模型给出的定性理由；未通过校验时退回程序描述。 */
  modelTip?: unknown;
}

const GENERIC_SIGHT_TYPE = /^(风景名胜|旅游景点|景点|公园广场|休闲娱乐|购物|文化场馆|地名地址信息|其他)$/;
const FOOD_TYPE = /菜|餐|火锅|小吃|茶|咖啡|甜品|面|粉|粥|烧烤|海鲜|酒家|食堂/;
const SIGHT_TYPE = /博物|馆|园|山|湖|寺|街|巷|镇|遗址|塔|桥|景区|祠|观|峰|岛|港|水乡|温泉|广场/;
// 季节与钟点描述必须和实际出行日期、到访时段一致，否则整条说明退回中性描述。
const SEASON_RULES: Array<[RegExp, number[]]> = [
  [/樱花|郁金香|桃花|牡丹|春/, [3, 4, 5]],
  [/荷花|夏/, [6, 7, 8]],
  [/红叶|银杏|菊花|秋/, [9, 10, 11]],
  [/梅花|雪景|冬/, [12, 1, 2]],
];
const NIGHT_TEXT = /夜游|夜景|夜场|夜间|傍晚|日落/;
const MORNING_TEXT = /清晨|早晨|早上|上午/;
const AFTERNOON_TEXT = /午后|下午/;
const HYPE_TEXT = /顶流|网红|人气|爆款|必吃|必去|出片率|第一名|最佳/;
const ROUTE_TEXT = /顺路|之后|之前|接在|联游|再前往/;
const BOOKING_TEXT = /预约|购票|门票/;
const MODEL_TIP_BANNED = /高德|百度|小红书|抖音|大众点评|评分|排名|热度|人气|网红|必吃|必去|爆款|点赞|收藏|打卡|首站|末站|最后一站|上午|中午|下午|傍晚|晚上|夜间|已验证|城市限定检索/;

const minuteOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const TRAVEL_TEXT: Record<string, string> = {
  "amap-driving": "高德驾车约",
  "amap-walking": "高德步行约",
  "amap-bicycling": "高德骑行约",
  "amap-transit": "高德公交约",
  "amap-matrix": "高德路网约",
};
const distanceText = (kilometers: number) => `${Math.round(kilometers * 10) / 10}公里`;

function typeSegments(poi: PoiSpot): string[] {
  return String(poi.poiType || "").split(/[;；|]/).map((item) => item.trim()).filter(Boolean);
}

function specificType(poi: PoiSpot, food: boolean): string | undefined {
  const segments = typeSegments(poi);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (!segment || segment.length > 8) continue;
    if (food ? FOOD_TYPE.test(segment) : SIGHT_TYPE.test(segment) && !GENERIC_SIGHT_TYPE.test(segment)) return segment;
  }
  return undefined;
}

function foodLabel(specific?: string): string {
  if (!specific) return "本地餐馆";
  if (/餐厅|餐馆|饭店|酒家|食堂|咖啡|茶馆|茶室|厅|店|吧/.test(specific)) return specific;
  if (specific.endsWith("菜")) return `${specific}馆`;
  if (/小吃|烧烤|火锅|面|粉|粥|海鲜|甜品/.test(specific)) return `${specific}店`;
  return `${specific}餐馆`;
}

function sightLabel(poi: PoiSpot): string {
  const text = `${poi.name}${poi.tag}`;
  if (/博物|展馆|展览|美术|科技馆|纪念馆|图书馆|陈列/.test(text)) return "展馆";
  if (/街|巷|坊|镇|夜市|商圈|历史文化/.test(text)) return "街区";
  if (/寺|庙|塔|祠|观|宫|教堂|遗址|古建/.test(text)) return "人文古建";
  if (/山|峰|岭|谷|峡|岩/.test(text)) return "山地";
  if (/湖|河|江|溪|湿地|水乡|海滨|沙滩/.test(text)) return "亲水景观";
  if (/公园|园林|植物园|花园/.test(text)) return "公园";
  if (/乐园|动物园|海洋馆/.test(text)) return "主题乐园";
  return "景区";
}

export function indoorPlace(poi: PoiSpot): boolean {
  return /博物|展馆|展览|美术馆|科技馆|图书馆|纪念馆|展厅|室内|水族馆|海洋馆|艺术馆|剧院/.test(`${poi.name}${poi.tag}${poi.poiType || ""}`);
}

/** 只接受内置候选的策划文案；季节、钟点与路线说法必须和本次排程一致。 */
export function catalogFeature(poi: PoiSpot, startMinute: number, month: number): string | undefined {
  if (poi.origin !== "catalog") return undefined;
  const clauses = String(poi.blurb || "").split(/[，,。；;]/).map((item) => item.trim()).filter(Boolean);
  const text = clauses.filter((item) => {
    if (HYPE_TEXT.test(item) || ROUTE_TEXT.test(item) || BOOKING_TEXT.test(item)) return false;
    // 内置文案的钟点说法必须和实际到访时间一致。
    if (AFTERNOON_TEXT.test(item) && startMinute < 13 * 60) return false;
    if (MORNING_TEXT.test(item) && startMinute >= 12 * 60) return false;
    if (NIGHT_TEXT.test(item) && startMinute < 17 * 60) return false;
    return true;
  }).join("，");
  if (!text) return undefined;
  const season = SEASON_RULES.find(([pattern]) => pattern.test(text));
  if (season && !season[1].includes(month)) return undefined;
  if (NIGHT_TEXT.test(text) && startMinute < 17 * 60) return undefined;
  if (MORNING_TEXT.test(text) && startMinute >= 12 * 60) return undefined;
  return text;
}

/** 模型理由只保留定性内容：数字、平台热度、营业与钟点说法一律拒绝，改由程序补齐事实。 */
export function acceptModelTip(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim().replace(/^推荐理由\s*[:：]\s*/, "").replace(/[。；;，,、]+$/, "");
  if (text.length < 8 || text.length > 64) return undefined;
  if (/\d/.test(text) || /[<>]/.test(text) || MODEL_TIP_BANNED.test(text)) return undefined;
  return text;
}

function windowWeather(visit: ScheduledVisit, hours: TourismHourSnapshot[]) {
  const start = minuteOf(visit.time);
  const end = minuteOf(visit.endTime);
  const rows = hours.filter((row) => row.date === visit.date && row.hour * 60 < end && (row.hour + 1) * 60 > start);
  if (!rows.length) return undefined;
  return {
    rain: Math.max(...rows.map((row) => row.rainProbability)),
    heat: Math.max(...rows.map((row) => row.heatRisk)),
    aqi: Math.max(...rows.map((row) => row.aqi)),
  };
}

function weatherNote(visit: ScheduledVisit, context: StopReasonContext): string {
  if (isFood(visit.poi)) return "";
  const weather = windowWeather(visit, context.hours);
  if (!weather) return "";
  if (indoorPlace(visit.poi)) {
    if (weather.rain >= 50) return `该时段降水概率${weather.rain}%，室内参观受影响较小`;
    if (weather.heat >= 60) return `该时段热风险${weather.heat}，室内参观更稳妥`;
    if (weather.aqi >= 100) return `该时段 AQI 最高${weather.aqi}，室内参观更稳妥`;
    return "";
  }
  if (weather.rain >= 50) return `该时段降水概率${weather.rain}%，建议备好雨具`;
  if (weather.heat >= 60) return `该时段热风险${weather.heat}，注意补水`;
  if (weather.aqi >= 100) return `该时段 AQI 最高${weather.aqi}，建议放缓节奏`;
  if (weather.rain <= 20 && weather.aqi <= 50 && weather.heat <= 30) return `该时段降水概率${weather.rain}%、AQI ${weather.aqi}，适合户外停留`;
  return "";
}

function routeRole(visit: ScheduledVisit, context: StopReasonContext): string {
  const parts: string[] = [];
  if (context.position === 1) parts.push("作为当日首站");
  else if (visit.travelMinutes > 0 || visit.travelDistanceKm > 0) parts.push(`距上一站${distanceText(visit.travelDistanceKm)}，${TRAVEL_TEXT[visit.travelSource] || "按坐标估算约"}${visit.travelMinutes}分钟`);
  if (isFood(visit.poi)) parts.push(minuteOf(visit.time) < 14 * 60 ? "衔接午餐" : "安排晚餐");
  if (context.dayTotal > 1 && context.position === context.dayTotal) parts.push("作为当日最后一站");
  return parts.join("，");
}

function featureClause(poi: PoiSpot, startMinute: number, month: number): string {
  const food = isFood(poi);
  const catalog = catalogFeature(poi, startMinute, month);
  if (catalog) return catalog;
  const label = food ? foodLabel(specificType(poi, true)) : specificType(poi, false) || sightLabel(poi);
  const parts = [label];
  const area = (poi.businessArea || "").trim();
  if (area) parts.push(`位于${area}${/商圈|广场|景区|一带|附近|路|街|站|片区/.test(area) ? "" : "一带"}`);
  if (!food && indoorPlace(poi)) parts.push("室内为主");
  return parts.join("，");
}

export function buildStopReason(visit: ScheduledVisit, context: StopReasonContext): string {
  const model = acceptModelTip(context.modelTip);
  const role = routeRole(visit, context);
  if (model) return `${[model, role].filter(Boolean).join("；")}。`;
  const feature = featureClause(visit.poi, minuteOf(visit.time), Number(visit.date.slice(5, 7)));
  const note = weatherNote(visit, context);
  const text = [feature, role, note].filter(Boolean).join("；");
  return `${text || visit.poi.blurb || "该地点按天气、距离与用餐时段筛入当日路线"}。`;
}
