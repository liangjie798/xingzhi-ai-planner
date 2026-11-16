import type { PoiSpot } from "./poi";

const A = 6378245.0;
const EE = 0.00669342162296594323;
const RAD = Math.PI / 180;
const cache = new Map<string, { expires: number; value: PoiSpot[] }>();

function outOfChina(longitude: number, latitude: number) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLatitude(x: number, y: number) {
  let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  value += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  value += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
  value += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
  return value;
}

function transformLongitude(x: number, y: number) {
  let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  value += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  value += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
  value += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
  return value;
}

/** Overpass 返回 WGS-84；高德底图与排程使用 GCJ-02。 */
export function wgs84ToGcj02(longitude: number, latitude: number): [number, number] {
  if (outOfChina(longitude, latitude)) return [longitude, latitude];
  let latitudeDelta = transformLatitude(longitude - 105, latitude - 35);
  let longitudeDelta = transformLongitude(longitude - 105, latitude - 35);
  const radLatitude = latitude * RAD;
  let magic = Math.sin(radLatitude);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  latitudeDelta = (latitudeDelta * 180) / ((A * (1 - EE)) / (magic * sqrtMagic) * Math.PI);
  longitudeDelta = (longitudeDelta * 180) / (A / sqrtMagic * Math.cos(radLatitude) * Math.PI);
  return [longitude + longitudeDelta, latitude + latitudeDelta];
}

interface OverpassElement {
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

export function parseOverpassParks(payload: unknown, limit = 6): PoiSpot[] {
  const elements = (payload as { elements?: OverpassElement[] } | null)?.elements;
  if (!Array.isArray(elements)) return [];
  const places: PoiSpot[] = [];
  for (const element of elements) {
    const name = element?.tags?.name?.trim();
    const latitude = element?.lat ?? element?.center?.lat;
    const longitude = element?.lon ?? element?.center?.lon;
    if (!name || !/[一-龥]/.test(name) || name.length > 30) continue;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const [gcjLongitude, gcjLatitude] = wgs84ToGcj02(longitude!, latitude!);
    places.push({
      name,
      longitude: gcjLongitude,
      latitude: gcjLatitude,
      tag: "城市公园（OSM）",
      category: "景点",
      blurb: "OpenStreetMap 公园数据",
      origin: "osm",
      sourceTitle: "OpenStreetMap 公园数据",
      sourceUrl: "https://www.openstreetmap.org/copyright",
    });
  }
  return places.filter((place, index, list) => list.findIndex((item) => item.name === place.name) === index).slice(0, limit);
}

/** 需要显式配置 OSM_OVERPASS_URL；公共实例在部分网络不可达，默认不发起请求。 */
export async function fetchOsmParks(center: { longitude: number; latitude: number }, radiusKm = 3): Promise<PoiSpot[]> {
  const endpoint = process.env.OSM_OVERPASS_URL?.trim();
  if (!endpoint || !endpoint.startsWith("https://")) return [];
  const cacheKey = `${center.latitude.toFixed(3)}:${center.longitude.toFixed(3)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;
  const query = `[out:json][timeout:8];nwr(around:${Math.round(radiusKm * 1000)},${center.latitude},${center.longitude})["leisure"~"^(park|garden|nature_reserve)$"];out center 12;`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Xingzhi-Planning/1.0 (https://lht574.cn)" },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) {
      cache.set(cacheKey, { expires: Date.now() + 15 * 60 * 1000, value: [] });
      return [];
    }
    const places = parseOverpassParks(await response.json());
    cache.set(cacheKey, { expires: Date.now() + 6 * 3600 * 1000, value: places });
    return places;
  } catch {
    cache.set(cacheKey, { expires: Date.now() + 15 * 60 * 1000, value: [] });
    return [];
  }
}
