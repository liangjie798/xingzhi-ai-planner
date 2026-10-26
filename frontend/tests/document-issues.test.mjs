import test from "node:test";
import assert from "node:assert/strict";
import {extractIntake,completeIntake} from "../src/lib/conversation-intake.ts";
import {weatherChartRequest} from "../src/lib/visualization-request.ts";
import {scheduleTourism,validateSchedule} from "../src/lib/tourism-scheduler.ts";
import {activityAgenda} from "../src/lib/activity-agenda.ts";
const today="2026-10-26";
const known={cityName:"杭州市",date:"2026-10-27",endDate:"2026-10-28",tripDays:2,activityType:"校园运动会",startHour:14,duration:2,allowedStartHour:12,allowedEndHour:18,participants:300,group:"儿童青少年",audienceDescription:"初中生",intensity:"中强度"};
test("plotting is an explicit metric request, never a new city or a shorter date range",()=>{
  const phrase="把两天的气温和降雨概率放在一起比较，画出对比图。";
  const original=structuredClone(known);
  assert.equal(extractIntake(phrase,today,known).cityName,undefined);
  assert.deepEqual(weatherChartRequest(phrase,known),{kind:"weather-comparison",dates:["2026-10-27","2026-10-28"],metrics:["temperature","rainProbability"]});
  assert.deepEqual(known,original);
});
test("explicit 14 to 16 bounds constrain the complete session and exported agenda",()=>{
  const delta=extractIntake("把时间改成14点到16点，活动必须在这个范围内全部完成，其他条件不变。",today,known);
  assert.deepEqual([delta.allowedStartHour,delta.allowedEndHour,delta.startHour],[14,16,14]);
  const updated=completeIntake(known,delta,today);
  assert.equal(updated.command,"analyze");assert.equal(updated.intake.known.cityName,known.cityName);
  assert.equal(completeIntake(known,{...delta,duration:3},today).command,"clarify");
  const items=activityAgenda(updated.patch,{slots:[{date:known.date,hour:14,score:90}],bestSlot:{hour:14},actions:[]},known.date);
  assert.equal(items[0].time.split("–")[0],"14:00");assert.equal(items.at(-1).time.split("–")[1],"16:00");
});
test("relative date ranges have two independent boundaries and replace old trip length",()=>{
  for(const [phrase,from,to,count] of [["日期改为明天到后天，其余条件不变。","2026-10-27","2026-10-28",2],["今天到大后天","2026-10-26","2026-10-29",4],["后天到大后天","2026-10-28","2026-10-29",2]]){
    const result=completeIntake(known,extractIntake(phrase,today,known),today).intake.known;
    assert.deepEqual([result.date,result.endDate,result.tripDays],[from,to,count]);assert.equal(result.cityName,known.cityName);
  }
});
test("today's tourism starts after Beijing now plus arrival buffer and never backfills",()=>{
  const poi={name:"夜景步行街",longitude:120,latitude:30,category:"景点",tag:"景点",blurb:"漫步"};
  const options={dates:[today],hours:[],allowedStartHour:6,allowedEndHour:21,now:new Date("2026-10-26T09:05:00Z")};
  const result=scheduleTourism([poi],options);
  assert.ok(result.visits.length);assert.ok(result.visits[0].time>="17:45");assert.deepEqual(validateSchedule(result.visits,options),[]);
  const late=scheduleTourism([poi],{...options,now:new Date("2026-10-26T14:00:00Z")});
  assert.equal(late.visits.length,0);assert.ok(late.warnings.length);
});
