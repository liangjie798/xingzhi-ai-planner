import type { TicketOption } from "./ticket-types";

type StationMap = Map<string, string>;
let stations: Promise<StationMap> | undefined;

const ALLOWED_HOSTS = ["kyfw.12306.cn", "www.12306.cn", "12306.cn"];

/** 12306 会间歇性返回 302（反爬/会话），跟随同域重定向并校验最终域名。 */
async function official(path: string, signal?: AbortSignal, cookie?: string) {
  const response = await fetch("https://kyfw.12306.cn" + path, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      Accept: "application/json,text/plain",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Referer: "https://kyfw.12306.cn/otn/leftTicket/init",
    },
    redirect: "follow",
  });
  const finalHost = response.redirected ? new URL(response.url).hostname : "";
  if (response.redirected && !ALLOWED_HOSTS.some((host) => finalHost === host || finalHost.endsWith("." + host))) throw Error("unexpected-host");
  if (!response.ok) throw Error("official-unavailable");
  return response;
}

async function stationCodes(): Promise<StationMap> {
  if (!stations)
    stations = (async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const text = await (await official("/otn/resources/js/framework/station_name.js")).text();
          const map: StationMap = new Map();
          for (const m of text.matchAll(/@[^|]+\|([^|]+)\|([A-Z]{3})\|/g)) map.set(m[1], m[2]);
          if (map.size) return map;
        } catch (error) {
          lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      throw lastError instanceof Error ? lastError : Error("station-directory-unavailable");
    })().catch((error) => {
      stations = undefined;
      throw error;
    });
  return stations;
}

/** 同一城市的车站按常见程度排序；城市本身优先，其次南/西/北/东等枢纽站。 */
const STATION_SUFFIX_PRIORITY = ["", "南", "西", "北", "东", "丰台", "朝阳", "虹桥", "浦东", "大兴", "西九龙", "北站"];

function stationRank(name: string, base: string): number {
  const suffix = name.slice(base.length);
  const index = STATION_SUFFIX_PRIORITY.indexOf(suffix);
  return index === -1 ? STATION_SUFFIX_PRIORITY.length : index;
}

/**
 * 把用户输入的城市/车站展开为候选车站。
 * 12306 的车次接口按“站对站”返回，输入“厦门→北京”时若只查“厦门站→北京站”，
 * 会漏掉实际开行的“厦门北→北京南”等车次；这里同时尝试同城其他车站。
 */
export function stationCandidates(map: StationMap, raw: string): string[] {
  const cleaned = raw.trim().replace(/\s+/g, "").replace(/市$/, "").replace(/站$/, "");
  if (!cleaned) return [];
  const exact = map.has(cleaned) ? cleaned : undefined;
  const alternatives = [...map.keys()].filter((name) => name.startsWith(cleaned) && name.length > cleaned.length);
  const names = [...new Set([...(exact ? [exact] : []), ...alternatives])];
  names.sort((a, b) => stationRank(a, cleaned) - stationRank(b, cleaned) || a.localeCompare(b));
  return names.slice(0, 8);
}

/** 车站组合按“城市主站优先、其次枢纽站”排序，限制总请求数以控制查询时间。 */
function stationPairs(origins: string[], destinations: string[]): Array<[string, string]> {
  const pairs: Array<{ origin: string; destination: string; rank: number; originIndex: number; destinationIndex: number }> = [];
  origins.forEach((origin, originIndex) =>
    destinations.forEach((destination, destinationIndex) =>
      pairs.push({ origin, destination, rank: originIndex + destinationIndex, originIndex, destinationIndex }),
    ),
  );
  pairs.sort((a, b) => a.rank - b.rank || a.originIndex - b.originIndex || a.destinationIndex - b.destinationIndex);
  return pairs.slice(0, 24).map(({ origin, destination }) => [origin, destination]);
}

/** 席别：价格键、显示名、余票字段下标。高铁/动车与普速都覆盖。 */
const SEATS: ReadonlyArray<readonly [priceKey: string, label: string, availabilityIndex: number]> = [
  ["A9", "商务座", 32],
  ["P", "特等座", 25],
  ["M", "一等座", 31],
  ["O", "二等座", 30],
  ["A2", "软座", 24],
  ["A1", "硬座", 29],
  ["AI", "一等卧", 33],
  ["AJ", "二等卧", 33],
  ["A3", "硬卧展示价", 28],
  ["A4", "软卧展示价", 23],
  ["A6", "高级软卧展示价", 21],
  ["WZ", "无座", 26],
];

async function mapWithConcurrency<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await run(items[index]);
      }
    }),
  );
  return results;
}

type TrainQueryResult = { options: TicketOption[]; note: string };

async function queryDirect(origin: string, destination: string, date: string, signal?: AbortSignal, maxRows = 12): Promise<TrainQueryResult> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0, 10) !== date) throw Error("invalid-date");
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }),
      days = (Date.parse(date) - Date.parse(today)) / 86400000;
    if (days < 0 || days > 14) return { options: [], note: "12306预售范围通常为15天，请选择范围内日期并以官网为准。" };

    const map = await stationCodes();
    const origins = stationCandidates(map, origin);
    const destinations = stationCandidates(map, destination);
    if (!origins.length || !destinations.length) return { options: [], note: "未匹配到12306车站，请填写准确城市或车站名。" };
    const originCodes = origins.map((name) => map.get(name)!).filter(Boolean);
    const destinationCodes = destinations.map((name) => map.get(name)!).filter(Boolean);

    const init = await official("/otn/leftTicket/init", signal);
    const cookie = init.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const published = (await init.text()).match(/CLeftTicketUrl\s*=\s*['"](leftTicket\/query[A-Z]?)['"]/)?.[1];
    if (!published) throw Error("query-entry-unavailable");

    // 多个同城车站组合依次尝试；按车次号去重，凑够目标车次或接近超时就停止。
    const deadline = Date.now() + 35_000;
    const rows: Array<{ row: string[]; checkedAt: string }> = [];
    const seenTrains = new Set<string>();
    for (const [from, to] of stationPairs(originCodes, destinationCodes)) {
      if (rows.length >= maxRows || Date.now() > deadline) break;
      try {
        const params = new URLSearchParams({
          "leftTicketDTO.train_date": date,
          "leftTicketDTO.from_station": from,
          "leftTicketDTO.to_station": to,
          purpose_codes: "ADULT",
        });
        const data = await (await official("/otn/" + published + "?" + params, signal, cookie)).json();
        if (!Array.isArray(data?.data?.result)) continue;
        for (const value of data.data.result) {
          if (typeof value !== "string") continue;
          const row = value.split("|");
          if (row[6] !== from || row[7] !== to || !/^\d{2}:\d{2}$/.test(row[8]) || !/^\d{2}:\d{2}$/.test(row[9])) continue;
          if (seenTrains.has(row[3])) continue;
          seenTrains.add(row[3]);
          rows.push({ row, checkedAt: new Date().toISOString() });
          if (rows.length >= maxRows) break;
        }
      } catch {
        // 单个车站组合失败不影响其余组合。
      }
      if (rows.length < maxRows) await new Promise((resolve) => setTimeout(resolve, 120));
    }

    const codeToName = new Map<string, string>();
    for (const [name, code] of map) codeToName.set(code, name);

    const options = (
      await mapWithConcurrency(rows, 3, async ({ row, checkedAt }) => {
        try {
          const params = new URLSearchParams({
            train_no: row[2],
            from_station_no: row[16],
            to_station_no: row[17],
            seat_types: row[35] || "",
            train_date: date,
          });
          const prices = await (await official("/otn/leftTicket/queryTicketPrice?" + params, signal, cookie)).json();
          return SEATS.flatMap(([key, seat, index]) => {
            const raw = String(prices?.data?.[key] || "").replace(/[¥￥,]/g, "");
            const price = Number(raw);
            if (!/^\d+(\.\d{1,2})?$/.test(raw) || price <= 0 || !Number.isFinite(price) || !row[index] || ["无", "--", "*"].includes(row[index])) return [];
            const [h, m] = row[10].split(":").map(Number);
            return [
              {
                mode: "火车" as const,
                service: row[3],
                seat: String(seat),
                price,
                departure: row[8],
                arrival: row[9],
                durationMinutes: h * 60 + m,
                arrivalDayOffset: Math.floor((Number(row[8].slice(0, 2)) * 60 + Number(row[8].slice(3)) + h * 60 + m) / 1440),
                originStation: codeToName.get(row[6]) || origin,
                destinationStation: codeToName.get(row[7]) || destination,
                sourceName: "铁路12306",
                sourceUrl: "https://kyfw.12306.cn/otn/leftTicket/init",
                priceBasis: "total" as const,
                checkedAt,
              },
            ];
          });
        } catch {
          return [] as TicketOption[];
        }
      })
    )
      .flat()
      .sort((a, b) => (a.departure || "").localeCompare(b.departure || "") || (a.arrival || "").localeCompare(b.arrival || "") || a.price - b.price);

    if (options.length) {
      const trainCount = new Set(options.map((option) => option.service)).size;
      return { options, note: `本次展示 ${trainCount} 个直达车次的可核实席别（含高铁/动车），余票与价格以12306购票页为准。` };
    }
    if (rows.length) return { options: [], note: "已查到部分车次，但未取得可核实的公开票价；请在12306核实。" };
    const searched = [...new Set([...origins, ...destinations])].slice(0, 6).join("、");
    return { options: [], note: `已核对 ${searched} 等车站组合，未取得同时含票价和时刻的车次；请在12306核实。` };
  } catch {
    return { options: [], note: "12306官方查询暂不可用或返回访问限制，未取得实时票价与时刻；请使用官方入口核实。" };
  }
}

// ---------------- 中转组合 ----------------

const TRANSFER_HUBS = ["郑州", "济南", "南京", "武汉", "长沙", "石家庄", "杭州", "广州", "上海", "成都", "重庆", "西安"];
const TRANSFER_BUFFER_SAME_STATION = 40;
const TRANSFER_BUFFER_DIFFERENT_STATION = 100;
const TRANSFER_MAX_OPTIONS = 4;

function clockMinutes(value?: string): number | undefined {
  const match = value?.match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

/** 用两段真实直达车次组合同日中转方案；换乘时间按同站 40 分钟/异站 100 分钟预留。 */
export function composeTrainTransfers(firstLeg: TicketOption[], secondLeg: TicketOption[]): TicketOption[] {
  const composed: TicketOption[] = [];
  for (const inbound of firstLeg) {
    if (inbound.arrivalDayOffset) continue;
    const arrive = clockMinutes(inbound.arrival);
    if (arrive === undefined) continue;
    for (const outbound of secondLeg) {
      const depart = clockMinutes(outbound.departure);
      if (depart === undefined || depart <= arrive) continue;
      const sameStation = Boolean(inbound.destinationStation) && inbound.destinationStation === outbound.originStation;
      const buffer = sameStation ? TRANSFER_BUFFER_SAME_STATION : TRANSFER_BUFFER_DIFFERENT_STATION;
      const transferMinutes = depart - arrive;
      if (transferMinutes < buffer || transferMinutes > 600) continue;
      const durationMinutes = (inbound.durationMinutes ?? 0) + transferMinutes + (outbound.durationMinutes ?? 0);
      composed.push({
        mode: "火车",
        service: `${inbound.service}+${outbound.service}`,
        seat: `中转·${inbound.seat}+${outbound.seat}`,
        price: Math.round((inbound.price + outbound.price) * 100) / 100,
        departure: inbound.departure,
        arrival: outbound.arrival,
        durationMinutes,
        arrivalDayOffset: outbound.arrivalDayOffset ?? 0,
        originStation: inbound.originStation,
        destinationStation: outbound.destinationStation,
        sourceName: "铁路12306 · 中转组合",
        sourceUrl: "https://kyfw.12306.cn/otn/leftTicket/init",
        priceBasis: "total",
        stops: 1,
        checkedAt: new Date().toISOString(),
      });
      if (composed.length >= TRANSFER_MAX_OPTIONS) break;
    }
    if (composed.length >= TRANSFER_MAX_OPTIONS) break;
  }
  const unique = composed.filter((option, index) => composed.findIndex((other) => other.service === option.service && other.departure === option.departure) === index);
  unique.sort((a, b) => a.price - b.price || (a.durationMinutes ?? 0) - (b.durationMinutes ?? 0));
  return unique.slice(0, TRANSFER_MAX_OPTIONS);
}

function transferHubs(origin: string, destination: string, limit: number): string[] {
  const clean = (value: string) => value.replace(/市$/, "").trim();
  const from = clean(origin), to = clean(destination);
  return TRANSFER_HUBS.filter((hub) => hub !== from && hub !== to).slice(0, limit);
}

async function queryTransfers(origin: string, destination: string, date: string, directCount: number, signal?: AbortSignal): Promise<TicketOption[]> {
  const hubs = transferHubs(origin, destination, directCount >= 8 ? 2 : 3);
  const transfers: TicketOption[] = [];
  for (const hub of hubs) {
    if (signal?.aborted) break;
    try {
      const [firstLeg, secondLeg] = await Promise.all([
        queryDirect(origin, hub, date, signal, 6),
        queryDirect(hub, destination, date, signal, 6),
      ]);
      transfers.push(...composeTrainTransfers(firstLeg.options, secondLeg.options));
    } catch {
      // 单个枢纽失败不影响其他中转组合。
    }
    if (transfers.length >= TRANSFER_MAX_OPTIONS) break;
  }
  return transfers.slice(0, TRANSFER_MAX_OPTIONS);
}

// ---------------- 对外入口 ----------------

const cache = new Map<string, { until: number; result: TrainQueryResult }>();
export async function searchTrains(origin: string, destination: string, date: string, signal?: AbortSignal) {
  const key = JSON.stringify([origin, destination, date, "v3"]);
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return structuredClone(hit.result);
  const direct = await queryDirect(origin, destination, date, signal);
  let result = direct;
  if (!signal?.aborted && direct.options.length < 24) {
    const transfers = await queryTransfers(origin, destination, date, direct.options.length, signal).catch(() => [] as TicketOption[]);
    if (transfers.length) {
      result = {
        options: [...direct.options, ...transfers],
        note: `${direct.note} 另含 ${transfers.length} 条经主要枢纽的中转组合（同站换乘预留40分钟、异站100分钟），换乘与购票请以12306为准。`,
      };
    }
  }
  if (!signal?.aborted) {
    for (const [k, v] of cache) if (v.until <= Date.now()) cache.delete(k);
    if (cache.size >= 60) cache.delete(cache.keys().next().value!);
    cache.set(key, { until: Date.now() + (result.options.length ? 60000 : 10000), result: structuredClone(result) });
  }
  return result;
}
