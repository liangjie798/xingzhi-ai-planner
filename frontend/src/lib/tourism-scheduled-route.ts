import type { TourismRequestPayload } from "./tourism";
import type { PoiSpot } from "./poi";
import type { TourismStop } from "./types";
import { scheduleTourism,validateSchedule,type ScheduleOptions } from "./tourism-scheduler";
import { routeTransfers } from "./tourism-routing-server";

export async function buildScheduledStops(body:TourismRequestPayload,candidates:PoiSpot[],dates:string[],enrich:(poi:PoiSpot,time:string,day:number,date:string)=>Promise<TourismStop>) {
  const options:ScheduleOptions={dates,hours:body.hours || [],allowedStartHour:body.allowedStartHour,allowedEndHour:body.allowedEndHour,group:body.group,intensity:body.intensity,audienceDescription:body.audienceDescription};
  const initial=scheduleTourism(candidates,options);
  const enriched=await Promise.all(initial.visits.map(visit=>enrich(visit.poi,visit.time,visit.day,visit.date)));
  const pool=initial.visits.map((visit,index)=>({...visit.poi,...enriched[index],longitude:enriched[index].longitude ?? visit.poi.longitude,latitude:enriched[index].latitude ?? visit.poi.latitude,openingHours:visit.poi.openingHours,openingDate:visit.poi.openingDate}));
  const first=scheduleTourism(pool,options);
  options.transfers=await routeTransfers(first.visits);
  const scheduled=scheduleTourism(pool,options);
  const errors=validateSchedule(scheduled.visits,options);
  if(errors.length) throw new Error("排程校验失败："+errors.join("；"));
  const stops:TourismStop[]=scheduled.visits.map(visit=>{
    const metadata=enriched.find(stop=>stop.name===visit.poi.name)!;
    const {poi,...schedule}=visit;
    return {...metadata,...schedule,tip:poi.blurb};
  });
  return {stops,warnings:scheduled.warnings,drivingLegs:Object.keys(options.transfers).length};
}
