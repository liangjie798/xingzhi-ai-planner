import { NextResponse } from "next/server";
import { officialPlaceEvidence, matchedSearchEvidence, mergePlaceEvidence } from "@/lib/place-evidence";
import { searchKnowledge } from "@/lib/social-research";

export async function POST(request:Request) {
  let body:{city?:unknown;places?:unknown};
  try { body = await request.json(); } catch { return NextResponse.json({detail:"请求格式不正确"},{status:400}); }
  if (typeof body.city !== "string" || !body.city.trim() || body.city.length > 80 || !Array.isArray(body.places) || body.places.length > 40 || body.places.some(place=>typeof place !== "string" || !place.trim() || place.length>100)) return NextResponse.json({detail:"城市或地点参数无效"},{status:400});
  const city = body.city.trim();
  const places = [...new Set(body.places as string[])];
  const started = performance.now();
  const official = officialPlaceEvidence(city,places);
  const uncovered = places.filter(place=>!official.some(item=>item.relatedPlaces?.includes(place)));
  // Bound extra searches; provider caches queries and validates result links.
  const searches = await Promise.allSettled(uncovered.slice(0,3).map(place=>searchKnowledge(`${city} ${place} 官方介绍 参观指南 活动`)));
  const evidence = mergePlaceEvidence([...official,...matchedSearchEvidence(city,places,searches.flatMap(result=>result.status === "fulfilled" ? result.value : []))]);
  const covered = places.filter(place=>evidence.some(item=>item.relatedPlaces?.includes(place)));
  const failed = searches.filter(result=>result.status === "rejected").length;
  return NextResponse.json({evidence, trace:{ id:"place-evidence", name:"补充地点资料与证据关联", detail:`${places.length}个推荐地点中，${covered.length}个取得关联资料；${places.length-covered.length}个暂无匹配资料。${failed ? `${failed}次地点搜索未完成。` : ""}官方资料和未核验全文的检索摘要分别标注，不据此确认开放或接待条件。`, status:evidence.length ? "done" : "fallback", durationMs:performance.now()-started }},{headers:{"Cache-Control":"private, no-store"}});
}
