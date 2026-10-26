"use client";
import type { TourismRoute } from "@/lib/types";
const minute=(time:string)=>Number(time.split(":")[0])*60+Number(time.split(":")[1]);
/** Uses the same start/end and transfer values as the document and map. */
export function TourismScheduleChart({route}:{route:TourismRoute}) {
  return <div className="tourism-gantt" aria-label="逐日游览与交通时间图">{route.stops.map(stop=>{
    const start=minute(stop.time),end=stop.endTime?minute(stop.endTime):start;
    return <div className="gantt-row" key={stop.name}><span>{stop.date.slice(5)} · {stop.name}</span><div className="gantt-track"><i className="gantt-transfer" style={{left:`${Math.max(0,start-(stop.travelMinutes || 0)-(stop.restMinutes || 0))/1440*100}%`,width:`${((stop.travelMinutes || 0)+(stop.restMinutes || 0))/1440*100}%`}}/><i className={stop.category==="美食"?"gantt-food":"gantt-visit"} style={{left:`${start/1440*100}%`,width:`${Math.max(0,end-start)/1440*100}%`}}/></div><small>{stop.time}–{stop.endTime || "待确认"}</small></div>;
  })}<p>时间轴为00:00–24:00；绿色为停留（含排队），棕色为用餐，浅色为前序交通与休息。数据与当前规划书一致。</p></div>;
}
