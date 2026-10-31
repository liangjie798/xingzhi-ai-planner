import test from "node:test";
import assert from "node:assert/strict";
import {scheduleTourism,validateSchedule,estimatedTransfer,visitWindows,transferKey,sameTourismPlace} from "../src/lib/tourism-scheduler.ts";
const date="2026-10-28";
const poi=(name,longitude=120,category="景点",extra={})=>({name,longitude,latitude:30,category,tag:category,blurb:name,...extra});
const hours=rain=>Array.from({length:24},(_,hour)=>({date,hour,temperature:20,humidity:60,aqi:50,heatRisk:10,rainProbability:typeof rain==="function"?rain(hour):rain}));
const options={now:new Date("2026-10-27T00:00:00Z"),dates:[date],hours:hours(0),allowedStartHour:9,allowedEndHour:20};
test("fallback puts meals in meal windows and never a wetland at 18:00",()=>{
  assert.equal(visitWindows(poi("西溪国家湿地公园",120,"景点",{tag:"热门街区"}),date).windows[0][1],17*60);
  assert.equal(sameTourismPlace(poi("杭州博物馆"),poi("杭州博物馆南馆",120.001)),true);
  assert.equal(sameTourismPlace(poi("清河坊历史街区"),poi("清河坊历史文化特色街区",120.001)),true);
  assert.equal(sameTourismPlace(poi("浙江省博物馆孤山馆区"),poi("浙江省博物馆之江馆区",120.3)),false);
  const result=scheduleTourism([poi("西溪湿地"),poi("楼外楼正餐",120.01,"美食"),poi("博物馆",120.02),poi("夜景步行街",120.03)],options);
  assert.ok(result.visits.length>=2);assert.deepEqual(validateSchedule(result.visits,options),[]);
  for(const visit of result.visits){if(visit.poi.name==="西溪湿地")assert.ok(visit.endTime<="17:00");if(visit.poi.category==="美食")assert.ok(visit.time>="11:00");}
  assert.ok(result.warnings.some(text=>text.includes("营业时间未知")));
});
test("weather affects actual scheduling across every hour of the complete visit",()=>{
  const pool=[poi("湖边步道")];
  const sunny=scheduleTourism(pool,{...options,allowedEndHour:17,hours:hours(0)});
  const rainy=scheduleTourism(pool,{...options,allowedEndHour:17,hours:hours(hour=>hour>=10&&hour<13?100:0)});
  assert.ok(sunny.visits[0].time<rainy.visits[0].time);assert.ok(rainy.visits[0].time>="13:00");
  const blocked=scheduleTourism(pool,{...options,hours:hours(100)});assert.equal(blocked.visits.length,0);assert.ok(blocked.warnings.some(text=>text.includes("没有同时满足")));
});
test("distance, supplied driving times, rest and queues participate in feasibility",()=>{
  const a=poi("甲博物馆"),near=poi("乙博物馆",120.01),far=poi("遥远博物馆",122);
  assert.ok(estimatedTransfer(a,far).minutes>estimatedTransfer(a,near).minutes);
  const transfers={[transferKey(a,near)]:{minutes:240,distanceKm:30,source:"amap-driving"}};
  assert.equal(scheduleTourism([a,near],{...options,allowedEndHour:12,transfers}).visits.length,1);
  const first=scheduleTourism([a,near],options);assert.deepEqual(validateSchedule(first.visits,options),[]);
  if(first.visits.length>1){const damaged=structuredClone(first.visits);damaged[1].time=damaged[0].endTime;assert.ok(validateSchedule(damaged,options).length>0);}
});
test("supplied hours constrain today only; closed and future hours never masquerade as verified",()=>{
  const a=poi("场馆",120,"景点",{openingHours:"10:00-12:00",openingDate:date});
  const result=scheduleTourism([a],options);assert.ok(result.visits[0].time>="10:00");assert.ok(result.visits[0].endTime<="12:00");
  assert.match(visitWindows(a,"2026-10-29").status,/待确认/);assert.deepEqual(visitWindows({...a,openingHours:"暂停营业"},date).windows,[]);assert.match(visitWindows({...a,openingHours:"以公告为准"},date).status,/待确认/);
});
test("afternoon-only preference rejects a long theme park rather than truncating it",()=>{
  assert.equal(scheduleTourism([poi("迪士尼主题乐园")],{...options,allowedStartHour:14,allowedEndHour:17}).visits.length,0);
});
