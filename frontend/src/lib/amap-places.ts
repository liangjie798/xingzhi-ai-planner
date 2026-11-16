import type { PoiSpot } from "./poi";

export interface AmapPoi {
  id?: string;
  name?: string;
  type?: string;
  location?: string;
  address?: string | string[];
  photos?: Array<{ url?: string }>;
  business?: { opentime_today?: string; business_area?: string };
}

export function cleanCityName(cityName: string): string {
  return cityName.split(/[·（(]/)[0].replace(/特别行政区$/, "").trim();
}

export function amapCategory(poi: AmapPoi, requested: "景点" | "美食"): "景点" | "美食" {
  return requested === "美食" || /餐饮|美食|小吃|咖啡|茶/.test(`${poi.type ?? ""}${poi.name ?? ""}`) ? "美食" : "景点";
}

/** 统一高德 POI 到内部候选结构；无法组成有效坐标的地点直接丢弃。 */
export function poiFromAmap(poi: AmapPoi, requested: "景点" | "美食", keyword: string, city: string): PoiSpot | null {
  const [longitude, latitude] = String(poi.location ?? "").split(",").map(Number);
  if (!poi.name || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const category = amapCategory(poi, requested);
  return {
    poiId: poi.id,
    name: poi.name,
    longitude,
    latitude,
    category,
    tag: category === "美食" ? "本地美食" : keyword.replace(city, ""),
    poiType: poi.type,
    businessArea: poi.business?.business_area,
    origin: "amap",
    blurb: String(poi.type || "").split(";").filter(Boolean).pop() || (category === "美食" ? "餐饮地点" : "游览地点"),
    address: typeof poi.address === "string" ? poi.address : undefined,
    openingHours: poi.business?.opentime_today,
    openingDate: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }),
    imageUrl: poi.photos?.find((photo) => typeof photo.url === "string")?.url?.replace(/^http:/, "https:"),
  };
}

const dedupe = (spots: PoiSpot[]) => spots.filter((poi, index, list) => list.findIndex((item) => item.name === poi.name) === index);

/** 城市限定关键字检索，按类别分别查询后再按名称去重。 */
export async function searchAmapPois(key: string, city: string, requests: Array<{ keyword: string; category: "景点" | "美食" }>): Promise<PoiSpot[]> {
  const batches = await Promise.all(requests.map(async ({ keyword, category }) => {
    try {
      const query = new URLSearchParams({ key, keywords: `${city}${keyword}`, region: city, city_limit: "true", show_fields: "business,photos", page_size: "10", page_num: "1" });
      const response = await fetch(`https://restapi.amap.com/v5/place/text?${query}`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
      const data = await response.json() as { status?: string; pois?: AmapPoi[] };
      if (data.status !== "1") return [];
      return (data.pois ?? []).map((poi) => poiFromAmap(poi, category, keyword, city)).filter((poi): poi is PoiSpot => Boolean(poi));
    } catch { return []; }
  }));
  return dedupe(batches.flat());
}

/** 以已入选景点为圆心补充就近餐饮，减少“选到城里但绕远”的停靠点。 */
export async function aroundAmapFoods(key: string, city: string, anchors: Array<{ longitude: number; latitude: number }>, radiusKm = 2): Promise<PoiSpot[]> {
  const nearby = await Promise.all(anchors.slice(0, 3).map(async (anchor) => {
    try {
      const query = new URLSearchParams({
        key, location: `${anchor.longitude},${anchor.latitude}`, keywords: "美食", radius: String(Math.round(radiusKm * 1000)),
        region: city, city_limit: "true", show_fields: "business,photos", page_size: "5", page_num: "1",
      });
      const response = await fetch(`https://restapi.amap.com/v5/place/around?${query}`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
      const data = await response.json() as { status?: string; pois?: AmapPoi[] };
      if (data.status !== "1") return [];
      return (data.pois ?? []).map((poi) => poiFromAmap(poi, "美食", "美食", city)).filter((poi): poi is PoiSpot => Boolean(poi));
    } catch { return []; }
  }));
  return dedupe(nearby.flat());
}
