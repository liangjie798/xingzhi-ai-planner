import type { TourismRequestPayload } from "./tourism";
import type { PoiSpot } from "./poi";
import type { TourismStop } from "./types";
import { scheduleTourism,validateSchedule,transferKey,type ScheduleOptions,type ScheduledVisit } from "./tourism-scheduler.ts";
import { routeMatrix,routeTransfers } from "./tourism-routing-server.ts";
import { buildStopReason } from "./tourism-reason.ts";

export interface ScheduledRouteOptions {
  /** 模型为本轮候选地点给出的定性理由，键为地点名称。 */
  tips?: Record<string, string>;
}

const legSignature=(visits:ScheduledVisit[])=>visits.map((visit,index)=>index&&visits[index-1].date===visit.date?transferKey(visits[index-1].poi,visit.poi):"").join("|");

export async function buildScheduledStops(body:TourismRequestPayload,candidates:PoiSpot[],dates:string[],enrich:(poi:PoiSpot,time:string,day:number,date:string)=>Promise<TourismStop>,options:ScheduledRouteOptions={}) {
  const scheduleOptions:ScheduleOptions={dates,hours:body.hours || [],allowedStartHour:body.allowedStartHour,allowedEndHour:body.allowedEndHour,group:body.group,intensity:body.intensity,audienceDescription:body.audienceDescription};
  const initial=scheduleTourism(candidates,scheduleOptions);
  const enriched=await Promise.all(initial.visits.map(visit=>enrich(visit.poi,visit.time,visit.day,visit.date)));
  const pool=initial.visits.map((visit,index)=>({...visit.poi,...enriched[index],longitude:enriched[index].longitude ?? visit.poi.longitude,latitude:enriched[index].latitude ?? visit.poi.latitude,openingHours:visit.poi.openingHours,openingDate:visit.poi.openingDate}));
  // 先用距离矩阵校准候选排序，再对最终相邻站按步行/骑行/公交/驾车分别取时长。
  const matrix=await routeMatrix(pool as PoiSpot[]);
  let transfers:NonNullable<ScheduleOptions["transfers"]>={...matrix};
  const first=scheduleTourism(pool,{...scheduleOptions,transfers});
  const gentle=body.group==="老年人"||body.group==="儿童青少年"||body.group==="敏感人群"||body.intensity==="低强度";
  const precise=await routeTransfers(first.visits,body.cityName,{gentle});
  transfers={...transfers,...precise};
  let scheduled=scheduleTourism(pool,{...scheduleOptions,transfers});
  if(legSignature(scheduled.visits)!==legSignature(first.visits)){
    const extra=await routeTransfers(scheduled.visits,body.cityName,{gentle});
    transfers={...transfers,...extra};
    scheduled=scheduleTourism(pool,{...scheduleOptions,transfers});
  }
  const errors=validateSchedule(scheduled.visits,scheduleOptions);
  if(errors.length) throw new Error("排程校验失败："+errors.join("；"));
  const stops:TourismStop[]=scheduled.visits.map(visit=>{
    const metadata=enriched.find(stop=>stop.name===visit.poi.name)!;
    const {poi,...schedule}=visit;
    const sameDay=scheduled.visits.filter(item=>item.date===visit.date);
    const position=sameDay.findIndex(item=>item.poi.name===visit.poi.name)+1;
    const tip=buildStopReason(visit,{hours:body.hours || [],position,dayTotal:sameDay.length,modelTip:options.tips?.[poi.name]});
    return {...metadata,...schedule,tip};
  });
  const routedLegs=scheduled.visits.filter((visit,index)=>{
    if(!index) return false;
    const previous=scheduled.visits[index-1];
    return previous.date===visit.date&&Boolean(transfers[transferKey(previous.poi,visit.poi)]);
  }).length;
  return {stops,warnings:scheduled.warnings,routedLegs};
}
