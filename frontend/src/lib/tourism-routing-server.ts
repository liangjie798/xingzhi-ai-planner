import type { PoiSpot } from "./poi";
import { transferKey, type ScheduledVisit } from "./tourism-scheduler";

const cache=new Map<string,{expires:number;minutes:number;distanceKm:number;source:"amap-driving"}>();
/** Fetch only proposed consecutive legs, not an expensive all-pairs matrix. */
export async function routeTransfers(visits:ScheduledVisit[]) {
  const key=process.env.AMAP_WEB_SERVICE_KEY;
  const output:Record<string,{minutes:number;distanceKm:number;source:"amap-driving"}>={};
  if(!key) return output;
  const pairs=visits.flatMap((visit,index)=>index&&visits[index-1].date===visit.date ? [[visits[index-1].poi,visit.poi] as [PoiSpot,PoiSpot]]:[]).slice(0,21);
  for(let start=0;start<pairs.length;start+=3) {
    await Promise.all(pairs.slice(start,start+3).map(async([a,b])=>{
      const id=transferKey(a,b),cacheId=`${a.longitude},${a.latitude}:${b.longitude},${b.latitude}`;
      const saved=cache.get(cacheId);if(saved&&saved.expires>Date.now()){output[id]=saved;return;}
      try {
        const query=new URLSearchParams({key,origin:`${a.longitude},${a.latitude}`,destination:`${b.longitude},${b.latitude}`,strategy:"0",extensions:"base"});
        const response=await fetch(`https://restapi.amap.com/v3/direction/driving?${query}`,{signal:AbortSignal.timeout(2500),cache:"no-store"});
        const data=await response.json() as {status?:string;route?:{paths?:Array<{duration?:string;distance?:string}>}};
        const path=data.status==="1"?data.route?.paths?.[0]:undefined;
        if(path&&Number(path.duration)>0&&Number(path.distance)>=0){
          const value={minutes:Math.ceil((Number(path.duration)/60+15)/5)*5,distanceKm:Math.round(Number(path.distance)/100)/10,source:"amap-driving" as const,expires:Date.now()+1800000};
          output[id]=value;if(cache.size>=200)cache.delete(cache.keys().next().value!);cache.set(cacheId,value);
        }
      } catch { /* The scheduler retains explicitly labelled coordinate estimates. */ }
    }));
  }
  return output;
}
