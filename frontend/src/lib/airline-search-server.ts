import { resolveAirportCity } from "./airport-cities.ts";
import { ACTIVE_AIRLINE_CODES, chooseAirlines } from "./airline-providers.ts";
import { airlineBrowserConfigured, probeAirline } from "./airline-browser-server.ts";
import type { AirlineCode, AirlineSearchResult, AirlineState, FlightQuery, ResolvedFlightQuery } from "./airline-types.ts";

export const AIRLINE_STATE_LABELS: Record<AirlineState,string> = {
  quoted:"取得官网展示报价", "no-flights":"官网本次未返回航班", "login-required":"官网要求登录", "verification-required":"官网要求人工验证",
  "session-expired":"官网查询会话过期", "tls-error":"官网证书校验未通过", timeout:"官网查询超时", "unverified-page":"查询条件或页面状态未能核实",
  "unrecognized-price":"未取得可核实的舱位价格", "not-configured":"官网浏览器查询尚未启用", unsupported:"尚未接入该航司", busy:"查询繁忙", cancelled:"查询已取消或达到等待上限",
};
export function validateFlightQuery(value: unknown, today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"})): ResolvedFlightQuery {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("invalid-search");
  const row=value as Record<string,unknown>;
  if(Object.keys(row).some(key=>!["origin","destination","date","airlineCodes"].includes(key)))throw new Error("invalid-search");
  if(typeof row.origin!=="string"||typeof row.destination!=="string"||row.origin.length>20||row.destination.length>20||typeof row.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(row.date))||new Date(row.date).toISOString().slice(0,10)!==row.date||row.date<today||(Date.parse(row.date)-Date.parse(today))/86_400_000>90)throw new Error("invalid-search");
  const from=resolveAirportCity(row.origin),to=resolveAirportCity(row.destination);
  if(!from||!to)throw new Error("unknown-airport-city");
  if(from.name===to.name)throw new Error("same-city");
  if(row.airlineCodes!==undefined&&(!Array.isArray(row.airlineCodes)||row.airlineCodes.length<1||row.airlineCodes.length>3||row.airlineCodes.some(code=>typeof code!=="string"||!ACTIVE_AIRLINE_CODES.includes(code as AirlineCode))))throw new Error("unsupported-airline");
  return {origin:row.origin.trim(),destination:row.destination.trim(),date:row.date,from,to,...(Array.isArray(row.airlineCodes)?{airlineCodes:[...new Set(row.airlineCodes)] as AirlineCode[]}:{})};
}
export function flightInputNote(error: unknown) {
  const code=error instanceof Error?error.message:"";
  return code==="unknown-airport-city"?"暂未收录该城市的明确机场映射，请使用已支持的地级城市或机场名称。":code==="same-city"?"出发城市与目的城市相同，请核对线路。":code==="unsupported-airline"?"所选航司尚未完成工具适配；可查询航司覆盖清单。":"请提供有效的出发城市、目的城市及今天起90天内的出发日期。";
}
const providerCache=new Map<string,{expires:number;result:Awaited<ReturnType<typeof probeAirline>>}>();
const cache=new Map<string,{expires:number;result:AirlineSearchResult}>();
const running=new Map<string,Promise<AirlineSearchResult>>();
let hourStart=Date.now(),hourQueries=0;
export async function searchAirlineFlights(input: FlightQuery, options: { signal?:AbortSignal; probe?:typeof probeAirline; today?:string }={}):Promise<AirlineSearchResult> {
  const base:AirlineSearchResult={origin:typeof input?.origin==="string"?input.origin:"",destination:typeof input?.destination==="string"?input.destination:"",date:typeof input?.date==="string"?input.date:"",checkedAt:new Date().toISOString(),status:"unavailable",quotes:[],providers:[],notes:[]};
  let query:ResolvedFlightQuery;try{query=validateFlightQuery(input,options.today);}catch(error){return {...base,notes:[flightInputNote(error)]};}
  if(!options.probe&&!airlineBrowserConfigured())return {...base,status:"not-configured",notes:["航司官网查价暂未启用，可先前往航司官网查询。"]};
  if(options.signal?.aborted)return {...base,notes:["本次查询已取消。"]};
  const providers=chooseAirlines(query),key=JSON.stringify([query.from.code,query.to.code,query.date,providers.map(p=>p.code)]);
  const saved=cache.get(key);if(saved&&saved.expires>Date.now())return structuredClone(saved.result);
  for(const [key,row]of cache)if(row.expires<=Date.now())cache.delete(key);
  // Never let another caller's cancellation or private browser session control this request.
  if(running.size)return {...base,notes:["当前有官网查询正在进行，请稍后重试。"]};
  if(Date.now()-hourStart>=3_600_000){hourStart=Date.now();hourQueries=0;}
  if(!options.probe&&hourQueries>=30)return {...base,notes:["本小时官网查询已达到低频访问上限，请稍后重试。"]};
  const job=(async()=>{
    hourQueries++;
    const deadline=AbortSignal.timeout(30_000),signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
    const result={...base,quotes:[...base.quotes],providers:[...base.providers],notes:[...base.notes]};
    for(const provider of providers){
      if(signal.aborted){result.notes.push("已达到本次等待上限，保留此前取得的结果。");break;}
      const providerKey=JSON.stringify([provider.code,query.from.code,query.to.code,query.date]);
      const previous=providerCache.get(providerKey);
      const found=previous&&previous.expires>Date.now()?structuredClone(previous.result):await (options.probe||probeAirline)(provider,query,signal).catch(()=>({attempt:{airlineCode:provider.code,sourceName:provider.name,state:"unverified-page" as const,sourceUrl:provider.home,checkedAt:new Date().toISOString(),quoteCount:0},quotes:[]}));
      if(!signal.aborted){for(const [k,v] of providerCache)if(v.expires<=Date.now())providerCache.delete(k);if(providerCache.size>=120)providerCache.delete(providerCache.keys().next().value!);providerCache.set(providerKey,{expires:Date.now()+(found.quotes.length?60000:10000),result:structuredClone(found)});}
      result.providers.push(found.attempt);
      // Quotes must still agree with trusted routing even when a browser adapter changes.
      result.quotes.push(...found.quotes.filter(quote=>quote.airlineCode===provider.code&&quote.date===query.date&&Number.isFinite(quote.price)&&quote.price>0&&quote.currency==="CNY"));
      if(found.attempt.state!=="quoted")result.notes.push(`${provider.name}：${AIRLINE_STATE_LABELS[found.attempt.state]}。`);
    }
    result.checkedAt=new Date().toISOString();result.status=result.quotes.length?"partial":"unavailable";
    result.notes.push(`范围：本次最多查询${providers.length}家已适配航司、单程1成人；部分站点只查询所列机场，不代表全航司或全机场最低价。`);
    result.notes.push("官网展示价尚未核实最终含税支付总额，余票、行李和退改规则以购票页面为准；火车票暂请前往12306官网查询，未取得火车实时报价。");
    return result;
  })();
  running.set(key,job);
  try{const result=await job;if(!options.signal?.aborted){if(cache.size>=60)cache.delete(cache.keys().next().value!);cache.set(key,{expires:Date.now()+(result.quotes.length?60_000:10_000),result:structuredClone(result)});}return result;}
  finally{running.delete(key);}
}
