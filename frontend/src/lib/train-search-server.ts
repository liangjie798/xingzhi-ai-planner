import type { TicketOption } from "./ticket-types";
let stations:Promise<Map<string,string>>|undefined;
async function official(path:string,signal?:AbortSignal,cookie?:string){
 const response=await fetch('https://kyfw.12306.cn'+path,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000),headers:{...(cookie?{Cookie:cookie}:{}),Accept:'application/json,text/plain','User-Agent':'Xingzhi travel planning','Referer':'https://kyfw.12306.cn/otn/leftTicket/init'},redirect:'error'});
 if(!response.ok)throw Error('official-unavailable');return response;
}
async function stationCodes(){
 if(!stations)stations=(async()=>{const text=await(await official('/otn/resources/js/framework/station_name.js')).text();const map=new Map<string,string>();for(const m of text.matchAll(/@[^|]+\|([^|]+)\|([A-Z]{3})\|/g))map.set(m[1],m[2]);if(!map.size)throw Error('station-directory-unavailable');return map;})().catch(e=>{stations=undefined;throw e;});
 return stations;
}
async function queryTrains(origin:string,destination:string,date:string,signal?:AbortSignal):Promise<{options:TicketOption[];note:string}>{
 try{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date).toISOString().slice(0,10)!==date)throw Error('invalid-date');
  const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),days=(Date.parse(date)-Date.parse(today))/86400000;
  if(days<0||days>14)return {options:[],note:'12306预售范围通常为15天，请选择范围内日期并以官网为准。'};
  const map=await stationCodes(),from=map.get(origin.replace(/市$/,'')),to=map.get(destination.replace(/市$/,''));
  if(!from||!to)return {options:[],note:'未匹配到12306车站，请填写准确城市或车站名。'};
  const init=await official('/otn/leftTicket/init',signal);
  const cookie=init.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const html=await init.text(),published=html.match(/CLeftTicketUrl\s*=\s*['"](leftTicket\/query[A-Z]?)['"]/)?.[1];
  if(!published)throw Error('query-entry-unavailable');
  const params=new URLSearchParams({'leftTicketDTO.train_date':date,'leftTicketDTO.from_station':from,'leftTicketDTO.to_station':to,purpose_codes:'ADULT'});
  const data=await(await official('/otn/'+published+'?'+params,signal,cookie)).json();
  if(!Array.isArray(data?.data?.result))throw Error('invalid-official-response');
  const names=data.data.map||{},rows=data.data.result.filter((r:unknown)=>typeof r==='string').map((r:string)=>r.split('|')).filter((r:string[])=>r[6]===from&&r[7]===to&&/^\d{2}:\d{2}$/.test(r[8])&&/^\d{2}:\d{2}$/.test(r[9])).slice(0,4);
  const options=(await Promise.all(rows.map(async(r:string[])=>{
   try{const p=new URLSearchParams({train_no:r[2],from_station_no:r[16],to_station_no:r[17],seat_types:r[35]||'',train_date:date});const prices=await(await official('/otn/leftTicket/queryTicketPrice?'+p,signal,cookie)).json();
    return [['O','二等座',30],['M','一等座',31],['A1','硬座',29],['A3','硬卧展示价',28],['A4','软卧展示价',23],['WZ','无座',26]].flatMap(([key,seat,index])=>{const raw=String(prices?.data?.[key]||'').replace(/[¥￥,]/g,'');const price=Number(raw);if(!/^\d+(\.\d{1,2})?$/.test(raw)||price<=0||!Number.isFinite(price)||!r[Number(index)]||['无','--','*'].includes(r[Number(index)]))return [];const [h,m]=r[10].split(':').map(Number);return [{mode:'火车' as const,service:r[3],seat:String(seat),price,departure:r[8],arrival:r[9],durationMinutes:h*60+m,arrivalDayOffset:Math.floor((Number(r[8].slice(0,2))*60+Number(r[8].slice(3))+h*60+m)/1440),originStation:names[r[6]]||origin,destinationStation:names[r[7]]||destination,sourceName:'铁路12306',sourceUrl:'https://kyfw.12306.cn/otn/leftTicket/init',priceBasis:'total' as const,checkedAt:new Date().toISOString()}];});
   }catch{return [];}
  }))).flat();
  return {options,note:options.length?'本次最多展示4个车次的可核实席别，余票与价格以12306购票页为准。':'本次未取得同时含票价和时刻的车次；请在12306核实。'};
 }catch{return {options:[],note:'12306官方查询暂不可用或返回访问限制，未取得实时票价与时刻；请使用官方入口核实。'};}
}

const cache=new Map<string,{until:number;result:Awaited<ReturnType<typeof queryTrains>>}>();
export async function searchTrains(origin:string,destination:string,date:string,signal?:AbortSignal){
 const key=JSON.stringify([origin,destination,date]),hit=cache.get(key);
 if(hit&&hit.until>Date.now())return structuredClone(hit.result);
 const result=await queryTrains(origin,destination,date,signal);
 if(!signal?.aborted){for(const [k,v] of cache)if(v.until<=Date.now())cache.delete(k);if(cache.size>=60)cache.delete(cache.keys().next().value!);cache.set(key,{until:Date.now()+(result.options.length?60000:10000),result:structuredClone(result)});}
 return result;
}
