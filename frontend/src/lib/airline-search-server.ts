import { resolveAirportCity } from "./airport-cities.ts";
import { ACTIVE_AIRLINE_CODES, chooseAirlines } from "./airline-providers.ts";
import { airlineBrowserConfigured, probeAirline } from "./airline-browser-server.ts";
import type { AirlineCode, AirlineQuote, AirlineSearchResult, AirlineState, AirlineStreamEvent, FlightQuery, ResolvedFlightQuery } from "./airline-types.ts";

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
  if(row.airlineCodes!==undefined&&(!Array.isArray(row.airlineCodes)||row.airlineCodes.length<1||row.airlineCodes.length>4||row.airlineCodes.some(code=>typeof code!=="string"||!ACTIVE_AIRLINE_CODES.includes(code as AirlineCode))))throw new Error("unsupported-airline");
  return {origin:row.origin.trim(),destination:row.destination.trim(),date:row.date,from,to,...(Array.isArray(row.airlineCodes)?{airlineCodes:[...new Set(row.airlineCodes)] as AirlineCode[]}:{})};
}
export function flightInputNote(error: unknown) {
  const code=error instanceof Error?error.message:"";
  return code==="unknown-airport-city"?"暂未收录该城市的明确机场映射，请使用已支持的地级城市或机场名称。":code==="same-city"?"出发城市与目的城市相同，请核对线路。":code==="unsupported-airline"?"所选航司尚未完成工具适配；可查询航司覆盖清单。":"请提供有效的出发城市、目的城市及今天起90天内的出发日期。";
}
const providerCache=new Map<string,{expires:number;result:Awaited<ReturnType<typeof probeAirline>>}>();
const cache=new Map<string,{expires:number;result:AirlineSearchResult}>();
const running=new Map<string,Promise<unknown>>();
export const AIRLINE_PROVIDER_WAIT_MS=24_000;
let hourStart=Date.now(),hourQueries=0;
export async function searchAirlineFlights(input: FlightQuery, options: { signal?:AbortSignal; probe?:typeof probeAirline; today?:string; providerTimeoutMs?:number }={}):Promise<AirlineSearchResult> {
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
    const deadline=AbortSignal.timeout(26_000),signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
    const result={...base,quotes:[...base.quotes],providers:[...base.providers],notes:[...base.notes]};
    // 各航司互相独立，并行探测让总耗时接近最慢的一家，而不是逐家累加。
    const settled=await Promise.all(providers.map(async provider=>{
      const providerKey=JSON.stringify([provider.code,query.from.code,query.to.code,query.date]);
      const previous=providerCache.get(providerKey);
      const providerDeadline=AbortSignal.timeout(options.providerTimeoutMs??AIRLINE_PROVIDER_WAIT_MS);
      const providerSignal=AbortSignal.any([signal,providerDeadline]);
      let found;
      if(previous&&previous.expires>Date.now())found=structuredClone(previous.result);
      else found=await (options.probe||probeAirline)(provider,query,providerSignal).catch(()=>({attempt:{airlineCode:provider.code,sourceName:provider.name,state:"unverified-page" as const,sourceUrl:provider.home,checkedAt:new Date().toISOString(),quoteCount:0},quotes:[]}));
      if(providerDeadline.aborted&&!signal.aborted&&!found.quotes.length)found.attempt={...found.attempt,state:"timeout"};
      if(!signal.aborted){for(const [k,v] of providerCache)if(v.expires<=Date.now())providerCache.delete(k);if(providerCache.size>=120)providerCache.delete(providerCache.keys().next().value!);providerCache.set(providerKey,{expires:Date.now()+(found.quotes.length?60000:10000),result:structuredClone(found)});}
      return {provider,found};
    }));
    for(const {provider,found} of settled){
      result.providers.push(found.attempt);
      // Quotes must still agree with trusted routing even when a browser adapter changes.
      result.quotes.push(...found.quotes.filter(quote=>quote.airlineCode===provider.code&&quote.date===query.date&&Number.isFinite(quote.price)&&quote.price>0&&quote.currency==="CNY"));
      if(found.attempt.state!=="quoted")result.notes.push(`${provider.name}：${AIRLINE_STATE_LABELS[found.attempt.state]}。`);
    }
    if(signal.aborted&&!result.quotes.length)result.notes.push("已达到本次等待上限，保留此前取得的结果。");
    result.checkedAt=new Date().toISOString();result.status=result.quotes.length?"partial":"unavailable";
    result.notes.push(`范围：本次最多并行查询${providers.length}家已适配航司、单程1成人；部分站点只查询所列机场，不代表全航司或全机场最低价。`);
    result.notes.push("官网展示价尚未核实最终含税支付总额，余票、行李和退改规则以购票页面为准；火车报价由独立的12306查询返回，请分别核对税费与票面价。");
    return result;
  })();
  running.set(key,job);
  try{const result=await job;if(!options.signal?.aborted){if(cache.size>=60)cache.delete(cache.keys().next().value!);cache.set(key,{expires:Date.now()+(result.quotes.length?60_000:10_000),result:structuredClone(result)});}return result;}
  finally{running.delete(key);}
}

export const STREAM_PROVIDER_LIMIT=8;
export const STREAM_CONCURRENCY=4;
export const AIRLINE_STREAM_WAIT_MS=40_000;

/**
 * 流式机票查询：按航司完成顺序逐条产出事件。
 * 前端因此可以先展示快的航司，慢的航司稍后补齐；限并发以控制服务器内存。
 */
export async function* streamAirlineFlights(
  input: FlightQuery,
  options: { signal?: AbortSignal; probe?: typeof probeAirline; today?: string; providerTimeoutMs?: number; overallTimeoutMs?: number; limit?: number } = {},
): AsyncGenerator<AirlineStreamEvent> {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();
  let query: ResolvedFlightQuery;
  try {
    query = validateFlightQuery(input, options.today);
  } catch (error) {
    yield { type: "done", status: "unavailable", checkedAt, notes: [flightInputNote(error)], quoteCount: 0, elapsedMs: 0 };
    return;
  }
  if (!options.probe && !airlineBrowserConfigured()) {
    yield { type: "start", checkedAt, providers: [], cached: false };
    yield { type: "done", status: "unavailable", checkedAt, notes: ["航司官网查价暂未启用，可先前往航司官网查询。"], quoteCount: 0, elapsedMs: 0 };
    return;
  }
  if (options.signal?.aborted) {
    yield { type: "start", checkedAt, providers: [], cached: false };
    yield { type: "done", status: "unavailable", checkedAt, notes: ["本次查询已取消。"], quoteCount: 0, elapsedMs: 0 };
    return;
  }
  const providers = chooseAirlines(query, options.limit ?? STREAM_PROVIDER_LIMIT);
  const startEvent = { type: "start" as const, checkedAt, providers: providers.map(provider => ({ airlineCode: provider.code, sourceName: provider.name })), cached: false };
  const key = JSON.stringify(["stream", query.from.code, query.to.code, query.date, providers.map(provider => provider.code)]);
  const saved = cache.get(key);
  const saveResult = (result: AirlineSearchResult) => {
    if (cache.size >= 60) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + (result.quotes.length ? 60_000 : 10_000), result: structuredClone(result) });
  };
  if (saved && saved.expires > Date.now()) {
    yield { ...startEvent, checkedAt: saved.result.checkedAt, cached: true };
    const grouped = new Map<string, AirlineQuote[]>();
    for (const quote of saved.result.quotes) grouped.set(quote.airlineCode, [...(grouped.get(quote.airlineCode) ?? []), quote]);
    for (const attempt of saved.result.providers) yield { type: "provider", attempt, quotes: grouped.get(attempt.airlineCode) ?? [], elapsedMs: 0 };
    yield { type: "done", status: saved.result.status === "partial" ? "partial" : "unavailable", checkedAt: saved.result.checkedAt, notes: saved.result.notes, quoteCount: saved.result.quotes.length, elapsedMs: Date.now() - startedAt };
    return;
  }
  if (running.size) {
    yield startEvent;
    yield { type: "done", status: "unavailable", checkedAt, notes: ["当前有官网查询正在进行，请稍后重试。"], quoteCount: 0, elapsedMs: Date.now() - startedAt };
    return;
  }
  if (Date.now() - hourStart >= 3_600_000) { hourStart = Date.now(); hourQueries = 0; }
  if (!options.probe && hourQueries >= 30) {
    yield startEvent;
    yield { type: "done", status: "unavailable", checkedAt, notes: ["本小时官网查询已达到低频访问上限，请稍后重试。"], quoteCount: 0, elapsedMs: Date.now() - startedAt };
    return;
  }
  hourQueries++;
  yield startEvent;

  const overallDeadline = AbortSignal.timeout(options.overallTimeoutMs ?? AIRLINE_STREAM_WAIT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, overallDeadline]) : overallDeadline;
  const queue: AirlineStreamEvent[] = [];
  let finished = false;
  let wake: (() => void) | undefined;
  const emit = (event: AirlineStreamEvent) => { queue.push(event); wake?.(); wake = undefined; };
  const remaining = [...providers];
  const settled: Array<{ provider: typeof providers[number]; found: Awaited<ReturnType<typeof probeAirline>> }> = [];

  const job = (async () => {
    const workers = Array.from({ length: Math.min(STREAM_CONCURRENCY, providers.length) }, async () => {
      for (let provider = remaining.shift(); provider; provider = remaining.shift()) {
        const providerStarted = Date.now();
        const providerKey = JSON.stringify([provider.code, query.from.code, query.to.code, query.date]);
        const previous = providerCache.get(providerKey);
        const providerDeadline = AbortSignal.timeout(options.providerTimeoutMs ?? AIRLINE_PROVIDER_WAIT_MS);
        const providerSignal = AbortSignal.any([signal, providerDeadline]);
        let found: Awaited<ReturnType<typeof probeAirline>>;
        if (previous && previous.expires > Date.now()) found = structuredClone(previous.result);
        else found = await (options.probe || probeAirline)(provider, query, providerSignal).catch(() => ({
          attempt: { airlineCode: provider.code, sourceName: provider.name, state: "unverified-page" as const, sourceUrl: provider.home, checkedAt: new Date().toISOString(), quoteCount: 0 },
          quotes: [],
        }));
        if (providerDeadline.aborted && !signal.aborted && !found.quotes.length) found.attempt = { ...found.attempt, state: "timeout" };
        if (!signal.aborted) {
          for (const [k, v] of providerCache) if (v.expires <= Date.now()) providerCache.delete(k);
          if (providerCache.size >= 120) providerCache.delete(providerCache.keys().next().value!);
          providerCache.set(providerKey, { expires: Date.now() + (found.quotes.length ? 60000 : 10000), result: structuredClone(found) });
        }
        const quotes = found.quotes.filter(quote => quote.airlineCode === provider.code && quote.date === query.date && Number.isFinite(quote.price) && quote.price > 0 && quote.currency === "CNY");
        settled.push({ provider, found });
        emit({ type: "provider", attempt: found.attempt, quotes, elapsedMs: Date.now() - providerStarted });
      }
    });
    await Promise.all(workers);

    const result: AirlineSearchResult = { origin: query.origin, destination: query.destination, date: query.date, checkedAt: new Date().toISOString(), status: "unavailable", quotes: [], providers: [], notes: [] };
    for (const { provider, found } of settled) {
      result.providers.push(found.attempt);
      result.quotes.push(...found.quotes.filter(quote => quote.airlineCode === provider.code && quote.date === query.date && Number.isFinite(quote.price) && quote.price > 0 && quote.currency === "CNY"));
      if (found.attempt.state !== "quoted") result.notes.push(`${provider.name}：${AIRLINE_STATE_LABELS[found.attempt.state]}。`);
    }
    if (signal.aborted && !result.quotes.length) result.notes.push("已达到本次等待上限，保留此前取得的结果。");
    result.status = result.quotes.length ? "partial" : "unavailable";
    result.notes.push(`范围：本次最多并行查询${providers.length}家已适配航司、单程1成人；部分站点只查询所列机场，不代表全航司或全机场最低价。`);
    result.notes.push("官网展示价尚未核实最终含税支付总额，余票、行李和退改规则以购票页面为准；火车报价由独立的12306查询返回，请分别核对税费与票面价。");
    result.notes.push("航司官网展示的经停/中转航班会标注「中转/经停」；是否可购买联程票以航司官网为准。");
    if (!signal.aborted) saveResult(result);
    emit({ type: "done", status: result.status === "partial" ? "partial" : "unavailable", checkedAt: result.checkedAt, notes: result.notes, quoteCount: result.quotes.length, elapsedMs: Date.now() - startedAt });
    finished = true; wake?.(); wake = undefined;
  })().catch(() => { finished = true; wake?.(); wake = undefined; });

  running.set(key, job);
  try {
    while (!finished || queue.length) {
      if (!queue.length) await new Promise<void>(resolve => { wake = resolve; });
      while (queue.length) yield queue.shift()!;
    }
  } finally {
    running.delete(key);
  }
}
