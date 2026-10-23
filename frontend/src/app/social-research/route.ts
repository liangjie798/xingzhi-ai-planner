import { NextResponse } from "next/server";
import { collectSocialResearch } from "@/lib/social-research";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body?.city !== "string" || !body.city.trim()) return NextResponse.json({ detail: "缺少城市" }, { status: 400 });
    return NextResponse.json(await collectSocialResearch(body.city.slice(0, 40), String(body.activity || "活动规划").slice(0, 30), Array.isArray(body.urls) ? body.urls.filter((u: unknown) => typeof u === "string").slice(0, 4) : []));
  } catch { return NextResponse.json({ detail: "公开内容检索暂不可用" }, { status: 502 }); }
}
