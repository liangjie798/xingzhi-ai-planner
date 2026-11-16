import { createHash } from "node:crypto";

const API = "https://api.map.baidu.com/place/v2/search";
const X_PI = (Math.PI * 3000) / 180;
const cache = new Map<string, { expires: number; value: BaiduPlaceMatch | null }>();

export interface BaiduPlaceMatch {
  name: string;
  address?: string;
  longitude: number;
  latitude: number;
  distanceMeters: number;
}

/** 百度使用 BD-09；高德底图与排程使用 GCJ-02。 */
export function bd09ToGcj02(longitude: number, latitude: number): [number, number] {
  const x = longitude - 0.0065;
  const y = latitude - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return [z * Math.cos(theta), z * Math.sin(theta)];
}

function haversineMeters(longitudeA: number, latitudeA: number, longitudeB: number, latitudeB: number) {
  const rad = Math.PI / 180;
  const deltaLatitude = (latitudeB - latitudeA) * rad;
  const deltaLongitude = (longitudeB - longitudeA) * rad;
  const haversine = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(latitudeA * rad) * Math.cos(latitudeB * rad) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function normalizeName(name: string) {
  return name.replace(/[（）()·\s\-—]/g, "").replace(/(有限公司|分公司|门店)$/g, "").toLowerCase();
}

function sameName(left: string, right: string) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  return Boolean(a && b) && (a === b || (Math.min(a.length, b.length) >= 2 && (a.includes(b) || b.includes(a))));
}

/** 百度要求服务端 AK 配合 SN 签名；没有 SK 时依赖控制台的 IP 白名单。 */
export function baiduSignedUrl(params: Record<string, string>, ak: string, sk?: string): string {
  const all = { ...params, ak };
  const base = Object.entries(all)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  if (!sk) return `${API}?${base}`;
  const sn = createHash("md5").update(`${base}${sk}`, "utf8").digest("hex");
  return `${API}?${base}&sn=${sn}`;
}

async function search(ak: string, input: { name: string; cityName: string; longitude: number; latitude: number }): Promise<BaiduPlaceMatch | null> {
  const sk = process.env.BAIDU_MAP_SK?.trim();
  const url = baiduSignedUrl({
    query: input.name,
    region: input.cityName,
    city_limit: "true",
    output: "json",
    scope: "2",
    page_size: "5",
  }, ak, sk || undefined);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as { status?: number; results?: Array<{ name?: string; address?: string; location?: { lat?: number; lng?: number } }> };
    if (Number(data.status) !== 0 || !Array.isArray(data.results)) return null;
    let best: BaiduPlaceMatch | null = null;
    for (const result of data.results) {
      const name = result.name?.replace(/<[^>]+>/g, "").trim();
      const latitude = Number(result.location?.lat);
      const longitude = Number(result.location?.lng);
      if (!name || !sameName(name, input.name) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const [gcjLongitude, gcjLatitude] = bd09ToGcj02(longitude, latitude);
      const distanceMeters = Math.round(haversineMeters(input.longitude, input.latitude, gcjLongitude, gcjLatitude));
      if (distanceMeters > 5000) continue;
      if (!best || distanceMeters < best.distanceMeters) best = { name, address: result.address, longitude: gcjLongitude, latitude: gcjLatitude, distanceMeters };
    }
    return best;
  } catch { return null; }
}

/** 返回按坐标最近、名称可核对上的百度地点；未配置 AK 时不发起请求。 */
export async function verifyBaiduPlace(input: { name: string; cityName: string; longitude: number; latitude: number }): Promise<BaiduPlaceMatch | null> {
  const ak = process.env.BAIDU_MAP_AK?.trim();
  if (!ak) return null;
  const cacheKey = `${input.cityName}:${input.name}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await search(ak, input);
  cache.set(cacheKey, { expires: Date.now() + (value ? 6 * 3600 * 1000 : 30 * 60 * 1000), value });
  return value;
}
