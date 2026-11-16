import { affirmativePlanningText } from "./conversation-semantics.ts";
import { cityNames } from "./city-introduction.ts";
import { cities } from "./cities.ts";

const KNOWN_CITY_NAMES = new Set([...cityNames, ...cities.map((city) => city.name.replace(/市$/, ""))]);
const PLACE_SUFFIX = /(?:市|区|县|省|旗|新区|自治州|特别行政区|林区)$/;
// 这些词说明候选片段是时间、意图、动作或数量，而不是地名。
const NOT_PLACE = /(?:周末|星期|周[一二三四五六日天]|下周|本周|这周|明天|后天|今天|今日|上午|下午|晚上|早上|中午|出发|到达|前往|计划|打算|准备|规划|安排|预算|日期|时间|轻松|一点|玩|旅游|旅行|活动|行程|帮我|帮忙|一个|两个|几个|多少|怎么|如何|哪里|哪个|我们|我想|想要|想|去|到|坐|乘|高铁|动车|航班|飞机|火车|机票|票价|看|逛|吃|住|买|参观|游览|展览|景点|人|岁|个)/;
const PLACE_PREFIX = /^(?:帮我|帮忙|请|我们|我|想|要|计划|打算|准备|规划|安排|去|到|从|坐|乘|一个|两个|这|那|周末|下周|本周|这周|下下?周[一二三四五六日天]?|高铁|动车|航班|飞机|火车|机票)+/;
const PLACE_CUT = /(?:看|逛|玩|吃|住|买|参观|游览|旅游|旅行|行程|活动|出发|前往|去|到|的)/;

/** 地名合法性：已知城市、带行政区后缀，或 2-8 个不含时间/意图/动作词的中文专名。 */
export function validPlaceName(value?: string): value is string {
  if (typeof value !== "string") return false;
  const name = value.trim();
  if (name.length < 2 || name.length > 18) return false;
  if (!/^[\u4e00-\u9fa5]+$/.test(name)) return false;
  const base = name.replace(PLACE_SUFFIX, "");
  if (KNOWN_CITY_NAMES.has(name) || KNOWN_CITY_NAMES.has(base)) return true;
  if (PLACE_SUFFIX.test(name) && base.length >= 2 && !NOT_PLACE.test(base)) return true;
  return name.length <= 8 && !NOT_PLACE.test(name);
}

/** 去掉前缀意图/时间/交通词和拖尾动作，得到干净地名。 */
function normalizePlace(value?: string): string | undefined {
  if (!value) return undefined;
  let name = value.trim().replace(PLACE_PREFIX, "");
  const cut = name.search(PLACE_CUT);
  if (cut === 0) return undefined;
  if (cut > 0) name = name.slice(0, cut);
  name = name.replace(/[，。；！？、\s].*$/, "").trim();
  return validPlaceName(name) ? name : undefined;
}
export function isTransportQuestion(text:string) {
  return /高铁|动车|航班|飞机|火车|机票|票价|怎么去|如何去|怎么走|如何走/.test(text) && !/研学.*任务|体育课|运动会|天气|气温/.test(text)
    || /(?:到|去|前往).+(?:便宜|省钱|划算|性价比)/.test(text);
}
export function journeyLocations(text:string):{originCity?:string;destination?:string} {
  text=affirmativePlanningText(text).replace(/^(?:只|仅)?(?:比较|查询|查一下|查|搜索)[，,\s]*/, "");
  // A leading departure date is not part of the origin city ("明天西安到榆林").
  text=text.replace(/^(?:(?:今年|明年)?[一二两三四五六七八九十\d]+月[一二两三四五六七八九十\d]+[日号]|大后天|后天|明天|今天|今日|下周|[一二两三四五六七八九十\d]+(?:天|个?(?:周|星期))后|(?:20\d{2}[-/年])?\d{1,2}[-/月]\d{1,2}[日号]?|\d{1,2}[日号])[，,\s]*/,"");
  const stop="(?=出发|前往|去|到|明天|后天|今天|未来|[，。；！？\\s]|$)";
  const origin=text.match(new RegExp(`(?:从|出发地(?:是|为|：|:)?|出发城市(?:是|为|：|:)?)\\s*([\\u4e00-\\u9fa5]{2,18}?)${stop}`));
  const route=text.match(/(?:从|^)\s*([\u4e00-\u9fa5]{2,18}?)(?:出发)?(?:[，,\s]*)(?:去|到|前往)\s*([\u4e00-\u9fa5]{2,18}?)(?=明天|后天|今天|出发|[一二两三四五六七八九十\d]+[日天号]|旅游|旅行|玩|的|查询|机票|票价|怎么|如何|坐|高铁|航班|飞机|哪个|哪种|[，。；！？\s]|$)/);
  const destination=text.match(/(?:改去|改到|改为|目的地(?:改成|改为|换成|是|为|：|:)?|想去|前往)\s*([\u4e00-\u9fa5]{2,18}?)(?=明天|后天|今天|出发|旅游|旅行|玩|的|[，。；！？\s]|$)/);
  return {originCity:normalizePlace(route?.[1]||origin?.[1]),destination:normalizePlace(route?.[2]||destination?.[1])};
}
export interface JourneyQuote {
  id:string;mode:"高铁"|"航班";origin:string;destination:string;date:string;
  fare:number;extraFees:number;groundCost:number;lineMinutes:number;groundMinutes:number;bufferMinutes:number;
  sourceUrl?:string;recordedAt:string;
}
export function compareJourney(quotes:JourneyQuote[],origin:string,destination:string,date:string,participants:number,timeValue:number) {
  const clean=(value:string)=>value.trim().replace(/市$/,"");
  const valid=quotes.filter(quote=>quote&&typeof quote.origin==="string"&&typeof quote.destination==="string"&&["高铁","航班"].includes(quote.mode)&&origin.trim()&&destination.trim()&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&clean(quote.origin)===clean(origin)&&clean(quote.destination)===clean(destination)&&quote.date===date&&[quote.fare,quote.extraFees,quote.groundCost,quote.lineMinutes,quote.groundMinutes,quote.bufferMinutes].every(value=>Number.isFinite(value)&&value>=0)&&quote.lineMinutes>0);
  const rows=valid.map(quote=>{const cost=Math.round((quote.fare+quote.extraFees+quote.groundCost)*100)/100;const minutes=quote.lineMinutes+quote.groundMinutes+quote.bufferMinutes;return {...quote,cost,minutes,totalCost:Math.round(cost*Math.max(1,participants)*100)/100,valueCost:Math.round((cost+minutes/60*Math.max(0,timeValue))*100)/100};});
  const comparable=rows.some(row=>row.mode==="高铁")&&rows.some(row=>row.mode==="航班");
  const by=(key:"cost"|"minutes"|"valueCost")=>comparable?[...rows].sort((a,b)=>a[key]-b[key])[0]:undefined;
  return {rows,comparable,cheapest:by("cost"),fastest:by("minutes"),recommended:by("valueCost")};
}
