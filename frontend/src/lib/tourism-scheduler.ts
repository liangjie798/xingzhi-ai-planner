import type { PoiSpot } from "./poi";
import type { TourismHourSnapshot } from "./tourism";
import { executionFloor } from "./beijing-time.ts";
import { airQualityNote } from "./air-quality-provenance.ts";

export interface ScheduleOptions {
  dates:string[]; hours:TourismHourSnapshot[]; allowedStartHour?:number; allowedEndHour?:number;
  group?:string; intensity?:string; audienceDescription?:string;
  now?:Date;
  transfers?:Record<string,{minutes:number;distanceKm:number;source:"amap-driving"|"estimate"}>;
}
export interface ScheduledVisit {
  poi:PoiSpot; day:number; date:string; time:string; endTime:string; visitMinutes:number;
  queueMinutes:number; restMinutes:number; travelMinutes:number; travelDistanceKm:number;
  travelSource:"amap-driving"|"estimate"; openingStatus:string; openingHours?:string; weatherAssessment:string;
}
export const clock = (minute:number)=>`${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`;
const minute = (value:string)=>Number(value.split(":")[0])*60+Number(value.split(":")[1]);
export const transferKey=(a:PoiSpot,b:PoiSpot)=>`${a.name}|${b.name}`;
export function distanceKm(a:PoiSpot,b:PoiSpot) {
  const rad=Math.PI/180;
  const h=Math.sin((b.latitude-a.latitude)*rad/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin((b.longitude-a.longitude)*rad/2)**2;
  return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function estimatedTransfer(a:PoiSpot,b:PoiSpot) {
  const distance=distanceKm(a,b);
  return {minutes:Math.ceil((distance<1 ? distance/3.5*60 : distance*1.5/18*60+15)/5)*5,distanceKm:Math.round(distance*1.5*10)/10,source:"estimate" as const};
}
export const isFood=(poi:PoiSpot)=>poi.category === "美食" || /美食|小吃|餐|本地菜|茶食/.test(poi.tag+poi.name);
const indoors=(poi:PoiSpot)=>/博物|科技馆|图书馆|美术馆|展览馆|纪念馆|展厅|室内/.test(poi.name+poi.tag);
// Catalog tags like "热门街区" are not evidence that a wetland opens at night.
const evening=(poi:PoiSpot)=>/步行街|不夜城|夜市|历史街区|历史文化特色街区|什刹海|外滩|桥西历史街区/.test(poi.name);
const placeCore=(name:string)=>name.replace(/[·（）()\s]/g,"").replace(/历史|文化|特色|南馆|北馆|东馆|西馆|国家|风景名胜|风景区/g,"");
export function sameTourismPlace(a:PoiSpot,b:PoiSpot) {
  if(a.poiId && b.poiId)return a.poiId===b.poiId;
  if(a.name===b.name)return true;
  // Branch labels differ across catalog and POI feeds. Only collapse matching
  // base names at the same site, never a chain's distant branches or neighbours.
  const base=(name:string)=>name.replace(/[（(][^）)]*[）)]/g,"").replace(/[·\s]/g,"");
  if(base(a.name)===base(b.name)&&distanceKm(a,b)<0.08)return true;
  const x=placeCore(a.name),y=placeCore(b.name);
  return distanceKm(a,b)<0.8&&(x===y || Math.min(x.length,y.length)>=4&&(x.includes(y)||y.includes(x)));
}

/** Only today's simple business hours can be treated as supplied hours. Weekly
 * descriptions and future dates stay unverified; conservative windows are assumptions. */
export function visitWindows(poi:PoiSpot,date:string):{windows:Array<[number,number]>;status:string} {
  if(poi.openingHours && poi.openingDate===date) {
    const windows=[...poi.openingHours.matchAll(/([0-2]?\d:[0-5]\d)\s*[-~至—–]\s*([0-2]?\d:[0-5]\d)/g)]
      .map(match=>[minute(match[1]),minute(match[2])] as [number,number]).filter(([a,b])=>a<b && b<=1440);
    if(windows.length) return {windows,status:"高德今日营业时段（非预约确认）"};
    if(/暂停营业|闭馆|休息|关闭/.test(poi.openingHours)) return {windows:[],status:"今日营业信息显示暂停开放"};
  }
  return {windows:isFood(poi) ? [[11*60,14*60],[17*60,20*60]] : evening(poi) ? [[9*60,20*60]] : [[9*60,17*60]],status:"待确认开放与预约；时段为保守排程假设"};
}
function weatherCost(poi:PoiSpot,date:string,start:number,end:number,hours:TourismHourSnapshot[]) {
  const rows=hours.filter(row=>row.date===date && row.hour*60<end && (row.hour+1)*60>start);
  const needed=Math.ceil(end/60)-Math.floor(start/60);
  const covered=new Set(rows.map(row=>row.hour));
  if(Array.from({length:needed},(_,index)=>Math.floor(start/60)+index).some(hour=>!covered.has(hour))) return {cost:35,blocked:false,text:"停留窗口预报不完整，天气待复核"};
  const rain=Math.max(...rows.map(row=>row.rainProbability));
  const heat=Math.max(...rows.map(row=>row.heatRisk));
  const aqi=Math.max(...rows.map(row=>row.aqi));
  const outdoor=!isFood(poi) && !indoors(poi);
  return {cost:outdoor ? rain*.55+heat*.3+Math.max(0,aqi-50)*.15 : 0,
    blocked:outdoor && (rain>=80 || heat>=80 || aqi>=200),
    text:`${clock(start)}–${clock(end)}窗口：降水概率最高${rain}%，US AQI最高${aqi}，热风险最高${heat}；${outdoor ? "户外停留已参与天气筛选" : "室内/餐饮候选，仍需确认现场条件"}${airQualityNote(rows) ? `；${airQualityNote(rows)}` : ""}`};
}

/** Bounded deterministic search: choose feasible full visit windows and penalize
 * travel/weather instead of forcing four stops each day. No claim of optimality. */
export function scheduleTourism(candidates:PoiSpot[],options:ScheduleOptions) {
  const pool=candidates.filter((poi,index,list)=>Number.isFinite(poi.longitude)&&Number.isFinite(poi.latitude)&&list.findIndex(other=>sameTourismPlace(other,poi))===index)
    .filter(poi=>!isFood(poi)||!/茶香体验|咖啡|奶茶|甜品|茶园|茶馆/.test(poi.name)||/餐|本地菜|饭|酒家/.test(poi.name));
  const used=new Set<string>();
  const visits:ScheduledVisit[]=[];const warnings:string[]=[];
  const baseStart=Math.max(8,options.allowedStartHour ?? 9)*60;
  const dayEnd=Math.min(21,options.allowedEndHour ?? 20)*60;
  const gentle=options.group==="老年人" || options.group==="儿童青少年" || options.intensity==="低强度";
  options.dates.forEach((date,dayIndex)=>{
    const dayStart=Math.max(baseStart,Math.ceil(executionFloor(date,30,options.now)/15)*15);
    let cursor=dayStart;let last:PoiSpot|undefined;
    let sightCount=0;const meals=new Set<string>();
    for(let count=0;count<5;count++) {
      const optionsForStop:Array<{visit:ScheduledVisit;score:number}>=[];
      for(const poi of pool) {
        if(used.has(poi.name)) continue;
        const food=isFood(poi);
        if(!food && sightCount>=3) continue;
        const travel=last ? options.transfers?.[transferKey(last,poi)] || estimatedTransfer(last,poi) : {minutes:0,distanceKm:0,source:"estimate" as const};
        if(travel.minutes>100) continue;
        const rest=last ? gentle ? 20 : 10 : 0;
        const queue=food ? 15 : /博物|乐园|兵马俑/.test(poi.name) ? 30 : 15;
        const duration=food ? 60 : /迪士尼|主题乐园|欢乐谷|环球影城/.test(poi.name) ? 360 : /湿地|颐和园|兵马俑|历史博物|故宫/.test(poi.name) ? 150 : 90;
        const window=visitWindows(poi,date);
        for(let start=Math.ceil((cursor+travel.minutes+rest)/15)*15;start+queue+duration<=dayEnd;start+=15) {
          const finish=start+queue+duration;
          if(!window.windows.some(([a,b])=>start>=a&&finish<=b)) continue;
          const meal=start<15*60 ? "lunch" : "dinner";
          if(food && (meals.has(meal) || !(meal==="lunch" ? start>=11*60&&finish<=14*60 : start>=17*60&&finish<=20*60))) continue;
          // Preserve a lunch interval rather than letting a long visit consume it.
          if(!food&&!meals.has("lunch")&&dayStart<=12*60&&start<14*60&&finish>13*60) continue;
          const weather=weatherCost(poi,date,start,finish,options.hours);
          if(weather.blocked) continue;
          const waiting=start-(cursor+travel.minutes+rest);
          const score=weather.cost+travel.minutes*.8+waiting*.2+(food&&start>=11*60&&start<13*60&&!meals.has("lunch") ? -20 : 0)+(!food&&sightCount===0 ? -10:0);
          optionsForStop.push({score,visit:{poi,day:dayIndex+1,date,time:clock(start),endTime:clock(finish),visitMinutes:duration,queueMinutes:queue,restMinutes:rest,travelMinutes:travel.minutes,travelDistanceKm:travel.distanceKm,travelSource:travel.source,openingStatus:window.status,openingHours:poi.openingDate===date ? poi.openingHours:undefined,weatherAssessment:weather.text}});
        }
      }
      optionsForStop.sort((a,b)=>a.score-b.score||a.visit.time.localeCompare(b.visit.time));
      const selected=optionsForStop[0]?.visit;if(!selected) break;
      visits.push(selected);used.add(selected.poi.name);last=selected.poi;cursor=minute(selected.endTime);
      if(isFood(selected.poi)) meals.add(minute(selected.time)<15*60 ? "lunch":"dinner");else sightCount++;
    }
    const daily=visits.filter(visit=>visit.date===date);
    if(!daily.length) warnings.push(`${date}：没有同时满足天气、时间与地点条件的行程，请放宽条件或补充室内地点。`);
    if(dayStart<13*60 && dayEnd>12*60 && !meals.has("lunch")) warnings.push(`${date}：未匹配到午餐地点，请在11:00–14:00预留用餐。`);
    if(daily.some(visit=>visit.weatherAssessment.includes("预报不完整"))) warnings.push(`${date}：部分停留窗口预报不完整，未完成天气筛选，执行前必须补齐数据或复核。`);
    if(daily.some(visit=>visit.openingStatus.startsWith("待确认"))) warnings.push(`${date}：部分营业时间未知，使用保守时段假设，必须确认后执行。`);
  });
  if(visits.some(visit=>visit.travelMinutes>0&&visit.travelSource==="estimate")) warnings.push("部分交通时间为按坐标、绕行系数和缓冲估算，非实时路况；已计入排程。未包含首站前与末站后的住宿通勤。");
  return {visits,warnings:[...new Set(warnings)]};
}

export function validateSchedule(visits:ScheduledVisit[],options:ScheduleOptions):string[] {
  const errors:string[]=[];
  const names=new Set<string>();
  for(const visit of visits){
    if(names.has(visit.poi.name)||visits.slice(0,visits.indexOf(visit)).some(previous=>sameTourismPlace(previous.poi,visit.poi))) errors.push(`${visit.poi.name}重复`);names.add(visit.poi.name);
    if(!options.dates.includes(visit.date)) errors.push(`${visit.poi.name}日期无效`);
    const start=minute(visit.time),end=minute(visit.endTime);
    if(end-start!==visit.visitMinutes+visit.queueMinutes||start<Math.max((options.allowedStartHour??8)*60,executionFloor(visit.date,30,options.now))||end>(options.allowedEndHour??21)*60) errors.push(`${visit.poi.name}完整停留超出可执行时段`);
    if(!visitWindows(visit.poi,visit.date).windows.some(([a,b])=>start>=a&&end<=b)) errors.push(`${visit.poi.name}不符合营业时段或保守假设`);
    const previous=visits.filter(other=>other.date===visit.date&&other.time<visit.time).at(-1);
    if(previous&&start<minute(previous.endTime)+visit.travelMinutes+visit.restMinutes) errors.push(`${visit.poi.name}交通/休息衔接不足`);
  }
  return errors;
}
