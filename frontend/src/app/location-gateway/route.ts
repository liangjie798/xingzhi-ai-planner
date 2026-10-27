import { NextRequest, NextResponse } from "next/server";
import { nationalLocations } from "@/lib/national-environment";

const AMAP_ENDPOINT = "https://restapi.amap.com/v3";

function serviceKey() {
  return process.env.AMAP_WEB_SERVICE_KEY || process.env.NEXT_PUBLIC_AMAP_KEY || "";
}

async function getAmap(path: string, params: URLSearchParams) {
  const key = serviceKey();
  if (!key) throw new Error("高德 Web 服务 Key 未配置");
  params.set("key", key);
  const response = await fetch(`${AMAP_ENDPOINT}${path}?${params.toString()}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`高德位置服务返回 ${response.status}`);
  const body = await response.json() as { status?: string; info?: string; [key: string]: unknown };
  if (body.status !== "1") throw new Error(body.info || "高德位置服务调用失败");
  return body;
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  try {
    if (action === "search") {
      const query = request.nextUrl.searchParams.get("q")?.trim();
      if (!query || query.length < 2 || query.length>80) return NextResponse.json([]);
      interface District {name?:string;center?:string;adcode?:string;level?:string;districts?:District[];provinceName?:string}
      const body = await getAmap("/config/district", new URLSearchParams({
        keywords: query,
        subdistrict: "0",
        extensions: "base",
      })) as { districts?:District[] };
      let districts=body.districts || [];
      // Full paths are not accepted as a single keyword by the district API.
      // Resolve the named parent and require the child to belong to it.
      const path=query.match(/[\u4e00-\u9fa5]{2,12}?(?:特别行政区|自治区|自治州|地区|省|市|区|县|旗)/g) || [];
      if(!districts.length&&path.length>=2&&path.join("")===query){
        const parentName=path.at(-2)!,childName=path.at(-1)!;
        const parent=await getAmap("/config/district",new URLSearchParams({keywords:parentName,subdistrict:"1",extensions:"base"})) as {districts?:District[]};
        let parents=(parent.districts || []).filter(item=>item.name===parentName);
        if(path.length>=3){
          const province=await getAmap("/config/district",new URLSearchParams({keywords:path[0]!,subdistrict:"0",extensions:"base"})) as {districts?:District[]};
          const codes=(province.districts || []).filter(item=>item.name===path[0]).map(item=>item.adcode?.slice(0,2)).filter(Boolean);
          parents=parents.filter(item=>codes.includes(item.adcode?.slice(0,2)));
        }
        districts=parents.flatMap(item=>(item.districts || []).filter(child=>child.name===childName).map(child=>({...child,provinceName:path.length>=3?path[0]:parentName})));
      }
      const results = districts.flatMap((item) => {
        const center = typeof item.center === "string" ? item.center.split(",").map(Number) : [];
        if (center.length !== 2 || !Number.isFinite(center[0]) || !Number.isFinite(center[1])) return [];
        return [{
          id: `amap-${item.adcode}`,
          name: String(item.name || query),
          province: String(nationalLocations.find(([code])=>item.adcode?.startsWith(code.slice(0,2)))?.[1] || item.provinceName || (item.level === "province" ? item.name : "中国大陆")),
          district: String(item.level === "district" ? item.name : ""),
          adcode: String(item.adcode || ""),
          longitude: center[0],
          latitude: center[1],
        }];
      });
      return NextResponse.json(results);
    }

    if (action === "reverse") {
      const rawLongitude = request.nextUrl.searchParams.get("longitude");
      const rawLatitude = request.nextUrl.searchParams.get("latitude");
      const longitude = Number(rawLongitude);
      const latitude = Number(rawLatitude);
      if (!rawLongitude?.trim() || !rawLatitude?.trim() || !Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        return NextResponse.json({ detail: "坐标无效" }, { status: 400 });
      }
      const body = await getAmap("/geocode/regeo", new URLSearchParams({
        location: `${longitude},${latitude}`,
        extensions: "base",
        radius: "1000",
      })) as { regeocode?: { formatted_address?: string; addressComponent?: Record<string, string | string[]> } };
      const component = body.regeocode?.addressComponent;
      const scalar = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] || "" : value || "";
      if (!component || !scalar(component.province) || !scalar(component.adcode)) return NextResponse.json({ detail: "无法识别该坐标所属地区" }, { status: 404 });
      return NextResponse.json({
        name: body.regeocode?.formatted_address || "地图选点",
        longitude,
        latitude,
        province: scalar(component.province),
        city: scalar(component.city) || scalar(component.province),
        district: scalar(component.district),
        adcode: scalar(component.adcode),
      });
    }
    return NextResponse.json({ detail: "不支持的位置服务操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ detail: error instanceof Error ? error.message : "位置服务暂不可用" }, { status: 502 });
  }
}
