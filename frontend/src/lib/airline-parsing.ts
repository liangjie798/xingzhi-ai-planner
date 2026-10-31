import { allowedAirlineUrl, type AirlineProvider } from "./airline-providers.ts";
import type { AirlinePageObservation, AirlineQuote, AirlineState, FlightRowObservation, ResolvedFlightQuery } from "./airline-types.ts";

export function airlinePageBarrier(text: string, url: string): AirlineState | undefined {
  if (/请依次点击|请完成.{0,30}验证|拖动滑块|验证您是真人|访问过于频繁|拒绝访问|Access Denied|Forbidden/i.test(text)) return "verification-required";
  if (/会话已过期|会话超时|session expired/i.test(text)) return "session-expired";
  if (/请先登录官网再进行操作|请登录后.{0,15}(查询|操作)|^https?:\/\/[^/]+\/(?:[^?#]*\/)?login(?:[/?#]|$)/i.test(text + "\n" + url) || /\/#\/login(?:[/?#]|$)/.test(url)) return "login-required";
  return undefined;
}
export function positiveFare(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).trim().replace(/[,，]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return undefined;
  const price = Number(text);
  return Number.isFinite(price) && price > 0 && price < 100_000 ? price : undefined;
}
export function canonicalFlightDate(value: string | undefined): string | undefined {
  const match = value?.trim().match(/^(20\d{2})[-/年]?(\d{2})[-/月]?(\d{2})(?:日|[ T].*)?$/);
  if (!match) return undefined;
  const result = `${match[1]}-${match[2]}-${match[3]}`;
  return Number.isFinite(Date.parse(result)) && new Date(result).toISOString().slice(0,10) === result ? result : undefined;
}
const clock = (text: string | undefined) => text?.match(/(?:^|\D)([01]\d|2[0-3]):([0-5]\d)(?!\d)/)?.slice(1).join(":");
function cabinFare(provider: AirlineProvider, row: FlightRowObservation): { price: number; cabin: string } | undefined {
  if (row.priceText !== undefined) {
    const price = positiveFare(row.priceText);
    return price ? { price, cabin: row.cabin || "官网展示价" } : undefined;
  }
  // These sites put a named cabin next to its own price. Never take a page/calendar minimum.
  if (["9H", "GS", "SC"].includes(provider.code)) {
    const cabin = row.text.match(/(?:^|\n)\s*经济舱\s*\n([\s\S]*?)(?=\n\s*(?:优选经济舱|舒适经济舱|鲁雁经济舱|公务舱|商务舱|头等舱|注意事项|起降时间)|$)/)?.[1];
    if (!cabin || /售罄|候补|无票|Infinity/i.test(cabin)) return undefined;
    const value = cabin.match(/[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/)?.[1] || cabin.match(/^\s*([\d,]+(?:\.\d{1,2})?)\s*元/)?.[1];
    const price = positiveFare(value);
    return price ? { price, cabin: "经济舱 · 官网展示价" } : undefined;
  }
  if (provider.code === "MU") {
    // The first column is economy. If it is '--', a business fare cannot take its place.
    const after = row.text.split(/航班详情/)[1]?.trim();
    const price = positiveFare(after?.match(/^[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/)?.[1]);
    return price ? { price, cabin: "经济舱 · 官网展示价" } : undefined;
  }
  if (provider.code === "KN") {
    const after = row.text.split(/航班详情/)[1]?.trim();
    const price = positiveFare(after?.match(/^(\d+(?:\.\d{1,2})?)(?:\s|$)/)?.[1]);
    return price ? { price, cabin: "官网展示价 · 舱位待核验" } : undefined;
  }
  if (["9C", "OQ", "RY"].includes(provider.code)) {
    const value = row.text.match(/[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/)?.[1];
    const price = positiveFare(value);
    return price ? { price, cabin: "官网展示起价 · 舱位待核验" } : undefined;
  }
  return undefined;
}

/** Fail closed if the selected route/date, row cabin or provenance cannot be checked. */
export function parseAirlinePage(provider: AirlineProvider, query: ResolvedFlightQuery, page: AirlinePageObservation, checkedAt: string): { state: AirlineState; quotes: AirlineQuote[] } {
  const barrier = airlinePageBarrier(page.text, page.url);
  if (barrier) return { state: barrier, quotes: [] };
  if (!allowedAirlineUrl(page.url, provider)) return { state: "unverified-page", quotes: [] };
  const pageDate = canonicalFlightDate(page.pageDate);
  const originMatches = page.originLabel?.includes(query.from.name);
  const destinationMatches = page.destinationLabel?.includes(query.to.name);
  const quotes: AirlineQuote[] = [];
  for (const row of page.rows.slice(0,100)) {
    const rowDate = canonicalFlightDate(row.departureDate || (provider.code==="KN"?row.text.match(/20\d{2}-\d{2}-\d{2}/)?.[0]:undefined));
    if ((rowDate || pageDate) !== query.date) continue;
    const hasCodes = Boolean(row.originCode && row.destinationCode);
    if (hasCodes ? !query.from.airports.includes(row.originCode!) || !query.to.airports.includes(row.destinationCode!) : !originMatches || !destinationMatches) continue;
    if (query.from.airports.length === 1 && query.from.code === query.from.airports[0] && ["PEK", "PKX", "PVG", "SHA", "TFU", "CTU"].includes(query.from.code) && !hasCodes && !page.originLabel?.includes(query.from.scope)) continue;
    if (query.to.airports.length === 1 && query.to.code === query.to.airports[0] && ["PEK", "PKX", "PVG", "SHA", "TFU", "CTU"].includes(query.to.code) && !hasCodes && !page.destinationLabel?.includes(query.to.scope)) continue;
    const expected = provider.code === "OQ" ? /(?:CZ\d{3,4}\s*\(OQ\d{3,4}\)|OQ\d{3,4})/ : new RegExp(`(?:^|[^A-Z0-9])(${provider.code}\\s*\\d{3,4})(?!\\d)`);
    const found = (row.flightNumber || row.text).match(expected)?.[provider.code === "OQ" ? 0 : 1]?.replace(/\s/g, "");
    if (!found) continue;
    const flights = [...row.text.matchAll(/(?<![A-Z0-9])([A-Z0-9]{2})\s?(\d{3,4})(?!\d)/g)].map(m => m[1]+m[2]);
    const own = [...new Set(flights.filter(f => provider.code === "OQ" ? f.startsWith(row.text.includes("CZ") ? "CZ" : "OQ") : f.startsWith(provider.code)))];
    if (own.length !== 1) continue; // Reject an ancestor containing several flight rows.
    const times = [...(provider.code==="KN"?row.text.replace(/(20\d{2}-\d{2}-\d{2})(\d{2}:\d{2})/g,"$1 $2"):row.text).matchAll(/(?<!\d)([0-2]\d:[0-5]\d)(?!\d)/g)].map(m => m[1]);
    const departure = clock(row.departure || times[0]), arrival = clock(row.arrival || times[1]);
    if (!departure || !arrival) continue;
    const fare = cabinFare(provider,row);
    if (!fare) continue;
    const marketing = provider.code === "OQ" ? found.match(/CZ\d+/)?.[0] || found : found;
    const operating = provider.code === "OQ" ? found.match(/OQ\d+/)?.[0] : undefined;
    const arrDate = canonicalFlightDate(row.arrivalDate);
    const dayOffset = rowDate && arrDate ? (Date.parse(arrDate)-Date.parse(rowDate))/86_400_000 : /\+\s*1\s*(?:天|日)?|次日/.test(row.text) ? 1 : undefined;
    quotes.push({ airlineCode:provider.code,sourceName:provider.name,flightNumber:marketing,operatingFlightNumber:operating,
      departure,arrival,arrivalDayOffset:dayOffset!==undefined&&dayOffset>=0&&dayOffset<=2?dayOffset:undefined,
      originStation:row.originStation,destinationStation:row.destinationStation,
      cabin:fare.cabin,price:fare.price,currency:"CNY",priceBasis: /页面报价为不含税价/.test(page.text) ? "base-fare" : "unknown",
      availability:"display-only",stops:row.stops ?? (/经停|中转/.test(row.text)?1:/直飞|直达/.test(row.text)?0:undefined),
      codeshare:Boolean(operating || /共享|实际承运/.test(row.text)),sourceUrl:page.url.split(";jsessionid=")[0],checkedAt,date:query.date });
  }
  const unique = quotes.filter((quote,index,all) => all.findIndex(other=>other.flightNumber===quote.flightNumber&&other.departure===quote.departure)===index);
  return { state:unique.length?"quoted":pageDate===query.date&&originMatches&&destinationMatches&&/暂无.{0,10}航班|没有.{0,10}航班|无符合.{0,10}航班/.test(page.text)?"no-flights":"unrecognized-price", quotes:unique };
}
