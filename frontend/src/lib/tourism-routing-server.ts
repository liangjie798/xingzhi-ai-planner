import type { PoiSpot } from "./poi";
import { distanceKm, transferKey, type ScheduledVisit } from "./tourism-scheduler.ts";

export type RouteSource = "amap-driving" | "amap-walking" | "amap-bicycling" | "amap-transit";
export type TransferSource = RouteSource | "amap-matrix";
interface TransferValue { expires:number; minutes:number; distanceKm:number; source:TransferSource }

const cache=new Map<string,TransferValue>();
const WALKING_LIMIT_KM=1.5;
const BICYCLING_LIMIT_KM=4;
const TRANSIT_LIMIT_KM=12;
const WALKING_BUFFER_MINUTES=5;
const BICYCLING_BUFFER_MINUTES=8;
const TRANSIT_BUFFER_MINUTES=12;
const DRIVING_BUFFER_MINUTES=15;
const MATRIX_BUFFER_MINUTES=10;

type RouteSpec = { mode:"walking"|"bicycling"|"transit"|"driving"; url:string; buffer:number; source:RouteSource; city?:string };
export interface TransferPreferences { /** 老人、儿童、敏感人群或低强度行程不默认骑行。 */ gentle?:boolean }

function routeSpec(a:PoiSpot,b:PoiSpot,cityName?:string,preferences?:TransferPreferences):RouteSpec {
  const distance=distanceKm(a,b);
  if(distance<=WALKING_LIMIT_KM) return {mode:"walking",url:"https://restapi.amap.com/v3/direction/walking",buffer:WALKING_BUFFER_MINUTES,source:"amap-walking"};
  if(distance<=BICYCLING_LIMIT_KM && !preferences?.gentle) return {mode:"bicycling",url:"https://restapi.amap.com/v4/direction/bicycling",buffer:BICYCLING_BUFFER_MINUTES,source:"amap-bicycling"};
  const city=cityName?.replace(/市$/,"").trim();
  if(distance<=TRANSIT_LIMIT_KM && city) return {mode:"transit",url:"https://restapi.amap.com/v3/direction/transit/integrated",buffer:TRANSIT_BUFFER_MINUTES,source:"amap-transit",city};
  return {mode:"driving",url:"https://restapi.amap.com/v3/direction/driving",buffer:DRIVING_BUFFER_MINUTES,source:"amap-driving"};
}

interface ParsedRoute { seconds:number; meters:number }

function parseRoute(payload:unknown,mode:RouteSpec["mode"]):ParsedRoute|null {
  const data=payload as {
    status?:string; errcode?:number;
    route?:{paths?:Array<{duration?:string;distance?:string}>;transits?:Array<{duration?:string;distance?:string}>};
    data?:{paths?:Array<{duration?:string;distance?:string}>};
  }|null;
  if(mode==="bicycling"){
    if(Number(data?.errcode)!==0) return null;
    const path=data?.data?.paths?.[0];
    return path?{seconds:Number(path.duration),meters:Number(path.distance)}:null;
  }
  if(data?.status!=="1") return null;
  const path=mode==="transit"?data?.route?.transits?.[0]:data?.route?.paths?.[0];
  return path?{seconds:Number(path.duration),meters:Number(path.distance)}:null;
}

async function requestRoute(key:string,a:PoiSpot,b:PoiSpot,spec:RouteSpec):Promise<{spec:RouteSpec;route:ParsedRoute}|null> {
  const query=new URLSearchParams({key,origin:`${a.longitude},${a.latitude}`,destination:`${b.longitude},${b.latitude}`});
  if(spec.mode==="driving"){query.set("strategy","0");query.set("extensions","base");}
  if(spec.mode==="transit"){query.set("city",spec.city||"");query.set("cityd",spec.city||"");query.set("strategy","0");query.set("nightflag","0");}
  try {
    const response=await fetch(`${spec.url}?${query}`,{signal:AbortSignal.timeout(2500),cache:"no-store"});
    const route=parseRoute(await response.json(),spec.mode);
    if(!route||!Number.isFinite(route.seconds)||route.seconds<=0||!Number.isFinite(route.meters)||route.meters<0) return null;
    return {spec,route};
  } catch { return null; }
}

/** Fetch only proposed consecutive legs. Mode follows straight-line distance:
 *  walking ≤1.5km, bicycling ≤4km, transit ≤12km within the city, driving beyond. */
export async function routeTransfers(visits:ScheduledVisit[],cityName?:string,preferences?:TransferPreferences) {
  const key=process.env.AMAP_WEB_SERVICE_KEY;
  const output:Record<string,{minutes:number;distanceKm:number;source:TransferSource}>={};
  if(!key) return output;
  const pairs=visits.flatMap((visit,index)=>index&&visits[index-1].date===visit.date ? [[visits[index-1].poi,visit.poi] as [PoiSpot,PoiSpot]]:[]).slice(0,21);
  for(let start=0;start<pairs.length;start+=3) {
    await Promise.all(pairs.slice(start,start+3).map(async([a,b])=>{
      let spec=routeSpec(a,b,cityName,preferences);
      const id=transferKey(a,b),cacheId=`${spec.mode}:${a.longitude},${a.latitude}:${b.longitude},${b.latitude}`;
      const saved=cache.get(cacheId);if(saved&&saved.expires>Date.now()){output[id]=saved;return;}
      let result=await requestRoute(key,a,b,spec);
      // 公交路线不可用时改用驾车，而不是退回未经路况校准的坐标估算。
      if(!result&&spec.mode==="transit"){
        spec={mode:"driving",url:"https://restapi.amap.com/v3/direction/driving",buffer:DRIVING_BUFFER_MINUTES,source:"amap-driving"};
        result=await requestRoute(key,a,b,spec);
      }
      if(!result) return;
      const value={minutes:Math.ceil((result.route.seconds/60+spec.buffer)/5)*5,distanceKm:Math.round(result.route.meters/100)/10,source:spec.source,expires:Date.now()+1800000};
      output[id]=value;if(cache.size>=200)cache.delete(cache.keys().next().value!);cache.set(cacheId,value);
    }));
  }
  return output;
}

/** 用高德距离测量 API 生成最多 8 个候选的全对驾车时长矩阵，供排程排序参考。
 *  该接口每个请求只能指定一个终点，因此按终点分批查询；最终相邻站仍由 routeTransfers 按实际交通方式校准。 */
export async function routeMatrix(pois:PoiSpot[]):Promise<Record<string,{minutes:number;distanceKm:number;source:"amap-matrix"}>> {
  const key=process.env.AMAP_WEB_SERVICE_KEY;
  const output:Record<string,{minutes:number;distanceKm:number;source:"amap-matrix"}>={};
  if(!key||pois.length<2||pois.length>8) return output;
  for(let start=0;start<pois.length;start+=4) {
    await Promise.all(pois.slice(start,start+4).map(async(destination)=>{
      const origins=pois.filter(item=>item!==destination);
      const query=new URLSearchParams({key,origins:origins.map(item=>`${item.longitude},${item.latitude}`).join("|"),destination:`${destination.longitude},${destination.latitude}`,type:"1"});
      try {
        const response=await fetch(`https://restapi.amap.com/v3/distance?${query}`,{signal:AbortSignal.timeout(2000),cache:"no-store"});
        const data=await response.json() as {status?:string;results?:Array<{origin_id?:string;distance?:string;duration?:string}>};
        if(data.status!=="1"||!Array.isArray(data.results)) return;
        for(const row of data.results){
          const index=Number(row.origin_id)-1;
          const origin=origins[index];
          const seconds=Number(row.duration),meters=Number(row.distance);
          if(!origin||!Number.isFinite(seconds)||seconds<=0||!Number.isFinite(meters)||meters<0) continue;
          output[transferKey(origin,destination)]={minutes:Math.ceil((seconds/60+MATRIX_BUFFER_MINUTES)/5)*5,distanceKm:Math.round(meters/100)/10,source:"amap-matrix"};
        }
      } catch { /* 矩阵仅用于排序，失败时继续用估算 */ }
    }));
  }
  return output;
}
