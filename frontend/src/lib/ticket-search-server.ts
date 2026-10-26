import { providerObjects, VariflightClient } from "./variflight-mcp-server.ts";
import type { TicketOption, TicketSearchResult } from "./ticket-types";

type Row = Record<string, unknown>;
function text(row: Row, ...keys: string[]) { return keys.map(key => row[key]).find(value => typeof value === "string") as string | undefined; }
function amount(value: unknown) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value))) return undefined;
  const result = Number(value);
  return Number.isFinite(result) && result > 0 && result < 100000 ? result : undefined;
}
export function cityCode(payload: unknown, city: string): string | undefined {
  const clean = (value: string) => value.replace(/市$/, "");
  const codes = new Set(providerObjects(payload).filter(row => clean(text(row, "cityName", "city_name", "city_name_cn") || "") === clean(city)).map(row => text(row, "cityCode", "city_code", "city_iata")).filter(code => code && /^[A-Z]{3}$/.test(code)));
  return codes.size === 1 ? [...codes][0] : undefined;
}
export function flightSql(dep: string, arr: string, date: string) {
  if (!/^[A-Z]{3}$/.test(dep) || !/^[A-Z]{3}$/.test(arr) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("invalid-search");
  // Fixed SQL follows the provider's documented query; no model/user SQL accepted.
  return `SELECT o.option_id, o.adult_total FROM flights(market := 'domestic', legs := [{'dep_city':'${dep}','arr_city':'${arr}','date':'${date}'}], cabin := 'economy') AS o WHERE o.transfers = 0 AND o.adult_total IS NOT NULL AND EXISTS (SELECT 1 FROM UNNEST(o.legs) AS l(leg) CROSS JOIN UNNEST(leg.segments) AS s(seg) WHERE seg.share IS FALSE) ORDER BY o.adult_total, o.option_id LIMIT 3`;
}
export function flightOptions(payload: unknown): TicketOption[] {
  return providerObjects(payload).flatMap(row => {
    const price = amount(row.adult_total);
    const id = text(row, "option_id");
    return price && id ? [{ mode: "航班" as const, service: "直飞航班候选", optionId: id, seat: "成人经济舱 · 含税", price }] : [];
  });
}
export function trainCandidates(payload: unknown, date: string) {
  return providerObjects(payload).flatMap(row => {
    const trainNumber = text(row, "trainNumber", "train_number");
    const depStationCode = text(row, "depStationCode", "dep_station_code");
    const arrStationCode = text(row, "arrStationCode", "arr_station_code");
    const returnedDate = text(row, "depDate", "dep_date");
    return trainNumber && /^[A-Z]?\d{1,6}$/.test(trainNumber) && depStationCode && /^[A-Z]{3}$/.test(depStationCode) && arrStationCode && /^[A-Z]{3}$/.test(arrStationCode) && (!returnedDate || returnedDate === date)
      ? [{ trainNumber, depDate: date, depStationCode, arrStationCode }] : [];
  });
}
export function trainOptions(payload: unknown, trainNumber: string): TicketOption[] {
  return providerObjects(payload).flatMap(row => {
    const price = amount(row.price ?? row.ticketPrice ?? row.ticket_price);
    const seat = text(row, "seatName", "seat_name", "seatTypeName");
    const inventory = row.remainingTickets ?? row.remaining_tickets ?? row.inventory ?? row.stock ?? row.remaining;
    const available = inventory === "有" || typeof inventory === "number" && inventory > 0 || typeof inventory === "string" && /^\d+$/.test(inventory) && Number(inventory) > 0;
    // An unpriced, sold-out or waitlisted seat cannot win the cheapest comparison.
    return price && seat && available ? [{ mode: "火车" as const, service: trainNumber, seat, price }] : [];
  });
}
export function summarizeTickets(options: TicketOption[], notes: string[]) {
  const sorted = [...options].sort((a, b) => a.price - b.price);
  if (!sorted.length) return `本次未取得可比较的实时报价，暂时不能判断哪种出行方式更便宜。${notes.join("；")}。`;
  const cheapest = sorted[0];
  const both = sorted.some(row => row.mode === "火车") && sorted.some(row => row.mode === "航班");
  return `${both ? "已返回的直达候选中" : "目前只取得一种交通方式的报价"}，${cheapest.mode} ${cheapest.service}（${cheapest.seat}）最低为 ¥${cheapest.price}/人。${both ? "可优先考虑这一候选。" : "尚不能判断它比另一种交通方式更便宜。"}\n${["火车", "航班"].map(mode => sorted.find(row => row.mode === mode)).filter(Boolean).map(row => `${row!.mode}：¥${row!.price}起/人（${row!.seat}）`).join("；")}。\n仅比较本次查到的成人直达票款，不含市内接驳及额外行李；价格、余票和退改条件以购票时为准。${notes.length ? `\n${notes.join("；")}。` : ""}`;
}

const running = new Map<string, Promise<TicketSearchResult>>();
export async function searchTickets(origin: string, destination: string, date: string): Promise<TicketSearchResult> {
  const base = { origin, destination, date, checkedAt: new Date().toISOString(), options: [] as TicketOption[], notes: [] as string[] };
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  if (!/^[\u4e00-\u9fa5]{2,20}$/.test(origin) || !/^[\u4e00-\u9fa5]{2,20}$/.test(destination) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date < today) {
    return { ...base, status: "unavailable", reply: "请提供有效的出发城市、目的城市和今天或之后的出发日期。" };
  }
  const key = process.env.VARIFLIGHT_MCP_KEY?.trim();
  if (!key) return { ...base, status: "not-configured", reply: "实时票价服务尚未启用，目前无法自动查价或判断哪种更便宜。服务接通后，只需提供出发地、目的地和日期，无需手动录入票价。" };
  const cacheKey = `${origin}:${destination}:${date}`;
  if (running.has(cacheKey)) return running.get(cacheKey)!;
  if (running.size >= 8) return { ...base, status: "unavailable", reply: "当前查价请求较多，请稍后重试。" };
  const job = (async (): Promise<TicketSearchResult> => {
    const client = new VariflightClient(key, AbortSignal.timeout(30_000));
    try {
      await client.initialize();
      const results = await Promise.allSettled([
        (async () => {
          const cities = await Promise.all([client.call("searchAirport", { name: origin, region: "CN" }), client.call("searchAirport", { name: destination, region: "CN" })]);
          const dep = cityCode(cities[0], origin), arr = cityCode(cities[1], destination);
          if (!dep || !arr) throw new Error("ambiguous-city");
          return flightOptions(await client.call("getRouteFlightTickets", { sql: flightSql(dep, arr, date) }));
        })(),
        (async () => {
          const found = await client.call("domesticDirectTrainSearch", { depDate: date, depCityName: origin, arrCityName: destination });
          const candidates = trainCandidates(found, date).filter((row, index, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(row)) === index).slice(0, 6);
          if (!candidates.length) throw new Error("no-recognized-trains");
          const details = await Promise.allSettled(candidates.map(async candidate => trainOptions(await client.call("trainDetail", candidate), candidate.trainNumber)));
          return details.flatMap(detail => detail.status === "fulfilled" ? detail.value : []);
        })(),
      ]);
      const options = results.flatMap(result => result.status === "fulfilled" ? result.value : []).filter((row, index, all) => all.findIndex(other => other.mode === row.mode && other.service === row.service && other.optionId === row.optionId && other.seat === row.seat && other.price === row.price) === index).sort((a, b) => a.price - b.price).slice(0, 12);
      const notes = results.flatMap((result, index) => result.status === "rejected" || !result.value.length ? [`未取得可识别的${index === 0 ? "航班含税" : "火车可售席位"}报价；可能暂无候选、超出发售范围、权限不足或数据暂不可用`] : []);
      notes.push("范围：直飞经济舱及最多6个直达火车候选，不代表全网最低价");
      return { ...base, checkedAt: new Date().toISOString(), options, notes, status: options.length ? notes.length > 1 ? "partial" : "available" : "unavailable", reply: summarizeTickets(options, notes) };
    } catch {
      return { ...base, status: "unavailable", reply: "实时票价服务暂不可用，请稍后重试；尚未取得报价，无法判断哪种更便宜。" };
    }
  })();
  running.set(cacheKey, job);
  try { return await job; } finally { running.delete(cacheKey); }
}
