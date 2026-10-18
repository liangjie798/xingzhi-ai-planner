import { NextRequest, NextResponse } from "next/server";

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
      if (!query || query.length < 2) return NextResponse.json([]);
      const geocodeBody = await getAmap("/geocode/geo", new URLSearchParams({ address: query, city: "全国" })) as {
        geocodes?: Array<Record<string, string | string[]>>;
      };
      const geocoded = (geocodeBody.geocodes ?? []).flatMap((item) => {
        const center = typeof item.location === "string" ? item.location.split(",").map(Number) : [];
        if (center.length !== 2 || !item.adcode) return [];
        const scalar = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] || "" : value || "";
        const city = scalar(item.city);
        const district = scalar(item.district);
        return [{
          id: `amap-${scalar(item.adcode)}`,
          name: district || city || scalar(item.province) || query,
          province: scalar(item.province) || "中国大陆",
          district,
          adcode: scalar(item.adcode),
          longitude: center[0],
          latitude: center[1],
        }];
      });
      if (geocoded.length) return NextResponse.json(geocoded.slice(0, 8));
      const body = await getAmap("/config/district", new URLSearchParams({
        keywords: query,
        subdistrict: "0",
        extensions: "base",
      })) as { districts?: Array<Record<string, string | string[]>> };
      const results = (body.districts ?? []).flatMap((item) => {
        const center = typeof item.center === "string" ? item.center.split(",").map(Number) : [];
        if (center.length !== 2 || !Number.isFinite(center[0]) || !Number.isFinite(center[1])) return [];
        return [{
          id: `amap-${item.adcode}`,
          name: String(item.name || query),
          province: String(item.level === "province" ? item.name : "中国大陆"),
          district: String(item.level === "district" ? item.name : ""),
          adcode: String(item.adcode || ""),
          longitude: center[0],
          latitude: center[1],
        }];
      });
      return NextResponse.json(results);
    }

    if (action === "geocode") {
      const address = request.nextUrl.searchParams.get("address")?.trim();
      const city = request.nextUrl.searchParams.get("city")?.trim() || "全国";
      if (!address) return NextResponse.json({ detail: "缺少地址" }, { status: 400 });
      const body = await getAmap("/geocode/geo", new URLSearchParams({ address, city })) as {
        geocodes?: Array<Record<string, string | string[]>>;
      };
      const item = body.geocodes?.[0];
      const location = typeof item?.location === "string" ? item.location.split(",").map(Number) : [];
      if (!item || location.length !== 2) return NextResponse.json({ detail: "未找到该活动地点" }, { status: 404 });
      const scalar = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] || "" : value || "";
      return NextResponse.json({
        name: scalar(item.formatted_address) || address,
        longitude: location[0],
        latitude: location[1],
        province: scalar(item.province) || "中国",
        city: scalar(item.city) || city,
        district: scalar(item.district),
        adcode: scalar(item.adcode),
      });
    }

    if (action === "reverse") {
      const longitude = Number(request.nextUrl.searchParams.get("longitude"));
      const latitude = Number(request.nextUrl.searchParams.get("latitude"));
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return NextResponse.json({ detail: "坐标无效" }, { status: 400 });
      }
      const body = await getAmap("/geocode/regeo", new URLSearchParams({
        location: `${longitude},${latitude}`,
        extensions: "base",
        radius: "1000",
      })) as { regeocode?: { formatted_address?: string; addressComponent?: Record<string, string | string[]> } };
      const component = body.regeocode?.addressComponent;
      if (!component) return NextResponse.json({ detail: "无法识别该坐标所属地区" }, { status: 404 });
      const scalar = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] || "" : value || "";
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
