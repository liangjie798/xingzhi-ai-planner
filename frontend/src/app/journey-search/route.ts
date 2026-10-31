import { NextResponse } from "next/server";
import { searchTickets } from "@/lib/ticket-search-server";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body!=="object" || Array.isArray(body) || ![body.origin, body.destination, body.date].every(value => typeof value === "string")) return NextResponse.json({ detail: "请填写出发地、目的地和日期。" }, { status: 400 });
    return NextResponse.json(await searchTickets(body.origin.trim(), body.destination.trim(), body.date,{signal:request.signal,airlineCodes:body.airlineCodes}), { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ detail: "查价请求格式错误。" }, { status: 400 }); }
}
