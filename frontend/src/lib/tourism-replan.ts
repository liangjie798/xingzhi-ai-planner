import type { ActivityInput,TourismRoute,TourismStop } from "./types";
import { scheduleTourism,validateSchedule,type ScheduleOptions } from "./tourism-scheduler";
import type { PoiSpot } from "./poi";
export function removeTourismStop(route:TourismRoute,input:ActivityInput,name:string):TourismRoute {
  if(!route.schedulingHours?.length || route.scheduleVersion!==2) throw new Error("旧版路线缺少天气与完整排程数据，请重新分析后编辑。");
  const retained=route.stops.filter(stop=>stop.name!==name);
  const candidates:PoiSpot[]=retained.filter((stop):stop is TourismStop&{longitude:number;latitude:number}=>stop.longitude!==null&&stop.latitude!==null).map(stop=>({...stop,blurb:stop.tip,openingDate:stop.openingStatus?.startsWith("高德今日")?stop.date:undefined}));
  const dates=Array.from({length:route.dayCount},(_,index)=>new Date(Date.parse(route.date)+index*86400000).toISOString().slice(0,10));
  const options:ScheduleOptions={dates,hours:route.schedulingHours,allowedStartHour:input.allowedStartHour,allowedEndHour:input.allowedEndHour,group:input.group,intensity:input.intensity,audienceDescription:input.audienceDescription};
  const scheduled=scheduleTourism(candidates,options);
  const errors=validateSchedule(scheduled.visits,options);if(errors.length)throw new Error(errors.join("；"));
  const stops=scheduled.visits.map(visit=>{const old=retained.find(stop=>stop.name===visit.poi.name)!;const {poi,...timing}=visit;void poi;return {...old,...timing};});
  return {...route,stops,summary:`已删除${name}，重新计算剩余${stops.length}站的停留、餐饮、天气、估算交通与休息衔接。`,scheduleWarnings:scheduled.warnings,notes:[...scheduled.warnings,"地点删除后重新排程；新交通衔接使用坐标估算，请重新核对。关联费用已从费用表移除，公共费用保留。"],evidence:route.evidence.flatMap(item=>item.relatedPlaces?.length ? [{...item,relatedPlaces:item.relatedPlaces.filter(place=>stops.some(stop=>stop.name===place))}].filter(item=>item.relatedPlaces.length):[item]),trace:[...route.trace,{id:`tour-replan-${Date.now()}`,name:"删除地点并重新排程",detail:`移除${name}，重新计算${stops.length}站完整窗口与交通休息；未重新查询路况，使用估算。`,status:"done",durationMs:0}]};
}
