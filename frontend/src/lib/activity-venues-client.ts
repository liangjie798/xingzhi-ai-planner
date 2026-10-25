import type { ActivityInput, ActivityVenue, DecisionResult } from "./types";
import { fetchPlaceEvidence } from "./place-evidence-client";
import { mergePlaceEvidence } from "./place-evidence";

export async function enrichActivityVenues(input: ActivityInput, result: DecisionResult): Promise<DecisionResult> {
  const start = performance.now();
  let venues: ActivityVenue[] = [];
  let notice = "地点检索暂不可用，请稍后重试；当前环境评分与时间安排仍可查看。";
  try {
    const response = await fetch("/activity-venues", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ input, indoorPreferred:result.bestSlot.rainProbability >= 40 || result.bestSlot.aqi > 100 || result.bestSlot.heatRisk >= 55 }), signal:AbortSignal.timeout(11000) });
    if (response.ok) {
      const data = await response.json() as { venues:ActivityVenue[]; notice:string };
      venues = data.venues || []; notice = data.notice;
    }
  } catch { /* Keep the verified environment result when venue lookup is unavailable. */ }
  const venueMs = performance.now()-start;
  const extra = await fetchPlaceEvidence(input.cityName || "",venues.map(venue=>venue.name));
  return { ...result, venues, venueNotice:notice, evidence:mergePlaceEvidence([...(extra?.evidence || []),...result.evidence]), trace:[...result.trace.filter(item => !["activity-venues","place-evidence"].includes(item.id)), { id:"activity-venues", name:"检索活动场地与推荐理由", detail:venues.length ? `按${input.activityType}、${input.group}、${input.participants}人及${input.duration}小时时长筛选${venues.length}个城市内场地候选；团体接待需确认。` : notice, status:venues.length ? "done" : "fallback", durationMs:venueMs }, ...(extra ? [extra.trace] : [])] };
}
