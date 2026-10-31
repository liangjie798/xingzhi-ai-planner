import type { AirlineCode, ResolvedFlightQuery } from "./airline-types.ts";

export interface AirlineProvider { code: AirlineCode; name: string; home: string; domains: string[]; hubs: string[]; url: (query: ResolvedFlightQuery) => string }
const params = (base: string, values: Record<string, string>) => `${base}?${new URLSearchParams(values)}`;
const day = (query: ResolvedFlightQuery) => query.date.slice(2).replaceAll("-", "");
const airport = (query: ResolvedFlightQuery, direction: "from" | "to") => query[direction].airports[0];
export const AIRLINE_PROVIDERS: AirlineProvider[] = [
  { code: "CZ", name: "南方航空", home: "https://www.csair.com/", domains: ["csair.com", "csair.cn"], hubs: ["广州", "深圳"], url: q => params("https://b2c.csair.com/B2C40/newTrips/static/main/page/booking/index.html", {t:"S",c1:q.from.code,c2:q.to.code,d1:q.date,at:"1",ct:"0",it:"0",bjt:String(Date.now()),b1:q.from.airports.join("-"),b2:q.to.airports.join("-")}) },
  { code: "MF", name: "厦门航空", home: "https://www.xiamenair.com/", domains: ["xiamenair.com"], hubs: ["厦门", "福州"], url: q => params("https://www.xiamenair.com/zh-cn/nticket.html", {tripType:"OW","orgCodeArr[0]":(q.from.name==="北京"&&q.from.airports.length>1?"PKX":airport(q,"from")),"dstCodeArr[0]":(q.to.name==="北京"&&q.to.airports.length>1?"PKX":airport(q,"to")),"orgDateArr[0]":q.date,dstDate:"",isInter:"false",adtNum:"1",chdNum:"0",infNum:"0",JFCabinFirst:"false",acntCd:"",mode:"Money",partner:"false",jcgm:"false",paxType:"",isPet:"false",petType:"noseat"}) },
  { code: "MU", name: "东方航空", home: "https://www.ceair.com/", domains: ["ceair.com", "ceair.cn"], hubs: ["上海"], url: q => `https://www.ceair.com/zh/cny/shopping/oneway/${q.from.airports.join(",")}-${q.to.airports.join(",")}/${q.date}` },
  { code: "OQ", name: "重庆航空", home: "https://www.chongqingairlines.cn/", domains: ["chongqingairlines.cn", "csair.com", "csair.cn"], hubs: ["重庆"], url: q => params("https://b2c.chongqingairlines.cn/cqvue/flight", {c1:airport(q,"from"),c2:airport(q,"to"),n1:q.from.name,n2:q.to.name,d1:q.date,d2:"",at:"1",ct:"0",it:"0"}) },
  { code: "9H", name: "长安航空", home: "https://www.airchangan.com/", domains: ["airchangan.com"], hubs: ["西安"], url: q => params("https://www.airchangan.com/flightsResult",{searchUrl:`${airport(q,"from")}-${airport(q,"to")}-${day(q)}-100-0`}) },
  { code: "GS", name: "天津航空", home: "https://www.tianjin-air.com/", domains: ["tianjin-air.com"], hubs: ["天津"], url: q => `https://www.tianjin-air.com/flights/results/${airport(q,"from")}-${airport(q,"to")}-${day(q)}-100-0` },
  { code: "SC", name: "山东航空", home: "https://www.sda.cn/", domains: ["sda.cn"], hubs: ["济南", "青岛"], url: q => `https://flights.sda.cn/flight/search/${airport(q,"from").toLowerCase()}-${airport(q,"to").toLowerCase()}-${day(q)}-1` },
  { code: "KN", name: "中国联合航空", home: "https://www.flycua.com/", domains: ["flycua.com"], hubs: ["北京"], url: q => `https://www.flycua.com/ticket/search/${q.from.code.toLowerCase()}-${day(q)}-${airport(q,"to").toLowerCase()}--1----` },
  { code: "9C", name: "春秋航空", home: "https://www.ch.com/", domains: ["ch.com"], hubs: ["上海", "石家庄"], url: q => params(`https://flights.ch.com/${q.from.code}-${q.to.code}.html`,{FDate:q.date,SType:"0",MType:"0"}) },
  { code: "RY", name: "江西航空", home: "https://www.airjiangxi.com/", domains: ["airjiangxi.com"], hubs: ["南昌"], url: q => params("https://www.airjiangxi.com/jiangxiair/book/findFlights.action",{tripType:"0",queryFlightInfo:`${airport(q,"from")},${airport(q,"to")},${q.date}`,adult:"1",child:"0",infant:"0"}) },
];
export const ACTIVE_AIRLINE_CODES: AirlineCode[] = ["MF", "SC", "RY", "GS", "9H"];
export function allowedAirlineUrl(value: string, provider: AirlineProvider) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && provider.domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)); }
  catch { return false; }
}
export function chooseAirlines(query: ResolvedFlightQuery): AirlineProvider[] {
  if (query.airlineCodes?.length) return query.airlineCodes.filter(code=>ACTIVE_AIRLINE_CODES.includes(code)).map(code => AIRLINE_PROVIDERS.find(provider => provider.code === code)!).filter(Boolean);
  return AIRLINE_PROVIDERS.filter(provider=>ACTIVE_AIRLINE_CODES.includes(provider.code)).sort((a,b) => Number(b.hubs.includes(query.from.name) || b.hubs.includes(query.to.name)) - Number(a.hubs.includes(query.from.name) || a.hubs.includes(query.to.name))).slice(0,3);
}
