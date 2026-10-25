import { NextResponse } from "next/server";
import { recommendActivityVenues, venueProfiles, type VenueCandidate } from "@/lib/activity-venues";
import type { ActivityInput } from "@/lib/types";

const candidateCache = new Map<string, { until:number; rows:VenueCandidate[] }>();
let nextRequestAt = 0;
async function pacedFetch(url:string): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0,nextRequestAt-now);
  nextRequestAt = Math.max(now,nextRequestAt)+450;
  if (wait) await new Promise(resolve=>setTimeout(resolve,wait));
  return fetch(url,{ signal:AbortSignal.timeout(4500),cache:"no-store" });
}

export async function POST(request: Request) {
  let body: { input: ActivityInput; indoorPreferred?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ detail:"请求格式不正确" }, { status:400 }); }
  const input = body?.input;
  if (!input || !Object.hasOwn(venueProfiles, input.activityType) || typeof input.cityName !== "string" || input.cityName.length > 80 || !Number.isInteger(input.duration) || input.duration < 1 || input.duration > 8 || !Number.isInteger(input.participants) || input.participants < 1 || input.participants > 100000 || typeof input.group !== "string") return NextResponse.json({ detail:"缺少有效的城市或活动条件" }, { status:400 });
  const key = process.env.AMAP_WEB_SERVICE_KEY || process.env.NEXT_PUBLIC_AMAP_KEY;
  const unavailable = () => NextResponse.json({ venues:[], notice:"本轮未取得可核对的场地候选，请补充区县或稍后重试。" });
  if (!key) return unavailable();
  let adcode = /^\d{6}$/.test(input.adcode || "") ? input.adcode! : "";
  if (!adcode) {
    try {
      const query = new URLSearchParams({ key, keywords:input.cityName, subdistrict:"0", extensions:"base" });
      const data = await (await fetch(`https://restapi.amap.com/v3/config/district?${query}`, { cache:"no-store", signal:AbortSignal.timeout(4000) })).json() as { status?:string; districts?:Array<{adcode:string}> };
      if (data.status === "1" && data.districts?.length === 1) adcode = data.districts[0].adcode;
    } catch { return unavailable(); }
  }
  if (!/^\d{6}$/.test(adcode)) return unavailable();
  const prefix = adcode.endsWith("0000") ? adcode.slice(0,2) : adcode.endsWith("00") ? adcode.slice(0,4) : adcode;
  const profile = venueProfiles[input.activityType as keyof typeof venueProfiles];
  const cacheKey = `${adcode}:${input.activityType}`;
  const cached = candidateCache.get(cacheKey);
  if (cached && cached.until > Date.now()) return NextResponse.json({ venues:recommendActivityVenues(cached.rows,input,Boolean(body.indoorPreferred)), notice:"地点来自城市限定 POI 检索；推荐不代表已确认开放、预约或团体接待条件。" });
  const batches = await Promise.all(profile.keywords.map(async keyword => {
    try {
      const query = new URLSearchParams({ key, keywords:keyword, city:adcode, citylimit:"true", extensions:"all", offset:"8", page:"1" });
      const url = `https://restapi.amap.com/v3/place/text?${query}`;
      let response = await pacedFetch(url);
      let data = await response.json() as { status?:string; infocode?:string; pois?:Array<{id?:string;name?:string;type?:string;adcode?:string;location?:string;address?:unknown}> };
      if (data.status !== "1" && ["10021","10014"].includes(data.infocode || "")) {
        await new Promise(resolve=>setTimeout(resolve,750));
        response = await pacedFetch(url); data = await response.json();
      }
      return (data.status === "1" ? data.pois || [] : []).flatMap(poi => {
        const [longitude,latitude] = String(poi.location || "").split(",").map(Number);
        if (!poi.name || !poi.adcode?.startsWith(prefix) || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
        return [{ id:poi.id || poi.name, name:poi.name, type:poi.type || keyword, address:typeof poi.address === "string" ? poi.address : "地址待核实", longitude,latitude } satisfies VenueCandidate];
      });
    } catch { return []; }
  }));
  const rows = batches.flat();
  if (rows.length) {
    if(candidateCache.size >= 100) candidateCache.delete(candidateCache.keys().next().value!);
    candidateCache.set(cacheKey,{until:Date.now()+3600000,rows});
  }
  const venues = recommendActivityVenues(rows, input, Boolean(body.indoorPreferred));
  return NextResponse.json({ venues, notice:venues.length ? "地点来自城市限定 POI 检索；推荐不代表已确认开放、预约或团体接待条件。" : "未找到与本次活动匹配的可核对场地，请补充区县或具体场地偏好。" });
}
