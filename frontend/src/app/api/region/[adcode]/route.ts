import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ adcode: string }> },
) {
  const { adcode } = await context.params;
  if (!/^\d{6}$/.test(adcode)) {
    return NextResponse.json({ detail: "无效的行政区编码" }, { status: 400 });
  }

  const filenames = [`${adcode}_full.json`, `${adcode}.json`];
  for (const filename of filenames) {
    try {
      const response = await fetch(`https://geo.datav.aliyun.com/areas_v3/bound/${filename}`, {
        headers: {
          Accept: "application/json",
          Referer: "https://datav.aliyun.com/",
          "User-Agent": "Shihou-Region-Service/1.0",
        },
        next: { revalidate: 86400 },
      });
      if (!response.ok) continue;
      const body = await response.text();
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/geo+json; charset=utf-8",
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      });
    } catch {
      // 尝试不含下级行政区的边界文件。
    }
  }
  return NextResponse.json({ detail: "行政区边界暂时不可用" }, { status: 502 });
}

