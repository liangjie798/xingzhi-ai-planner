import test from "node:test";
import assert from "node:assert/strict";
import {journeyLocations,compareJourney} from "../src/lib/journey.ts";
import {extractIntake,completeIntake} from "../src/lib/conversation-intake.ts";
import {detectAgentAction} from "../src/lib/agent-actions.ts";
test("transport comparison is not intercepted as a candidate-times action",()=>{
  assert.equal(detectAgentAction("对比高铁和航班"),null);assert.equal(detectAgentAction("比较前三个候选时段"),"compare");
});
test("continuous administrative names are preserved without punctuation and do not repeat destination questions",()=>{
  const known={activityType:"旅游规划",tripDays:3};
  for(const text of ["榆林市榆阳区明天出发2个人","陕西省榆林市榆阳区明天出发2个人","西安市雁塔区明天出发2个人"]){
    const patch=extractIntake(text,"2026-10-26",known);assert.match(patch.cityName,/榆阳区|雁塔区/);
    const result=completeIntake(known,patch,"2026-10-26");assert.ok(!result.missing.some(item=>item.includes("城市")));assert.equal(result.intake.known.participants,2);
    const next=completeIntake(result.intake.known,extractIntake("成年人","2026-10-26",result.intake.known),"2026-10-26");assert.equal(next.command,"analyze");
  }
});
test("origin and destination are different fields, an origin-only answer preserves the destination",()=>{
  assert.deepEqual(journeyLocations("从西安到杭州高铁和飞机哪个划算"),{originCity:"西安",destination:"杭州"});
  const patch=extractIntake("从西安出发","2026-10-26",{cityName:"杭州市"});assert.equal(patch.originCity,"西安");assert.equal(patch.cityName,undefined);
  const route=extractIntake("从榆林到西安旅游三天","2026-10-26",{});assert.equal(route.originCity,"榆林");assert.equal(route.cityName,"西安");
});
const quote=(id,mode,extra={})=>({id,mode,origin:"西安",destination:"杭州",date:"2026-10-28",fare:300,extraFees:0,groundCost:20,lineMinutes:300,groundMinutes:40,bufferMinutes:30,recordedAt:"2026-10-26T00:00:00Z",...extra});
test("door-to-door comparison adds taxes, luggage, access and buffers before recommending",()=>{
  const rail=quote("rail","高铁"),flight=quote("flight","航班",{fare:250,extraFees:100,groundCost:80,lineMinutes:120,groundMinutes:90,bufferMinutes:90});
  const result=compareJourney([rail,flight],"西安市","杭州","2026-10-28",2,0);
  assert.equal(result.comparable,true);assert.equal(result.cheapest.id,"rail");assert.equal(result.fastest.id,"flight");assert.equal(result.rows[1].cost,430);assert.equal(result.rows[1].minutes,300);assert.equal(result.rows[0].totalCost,640);
  assert.equal(compareJourney([rail,flight],"西安","杭州","2026-10-28",2,200).recommended.id,"flight");
});
test("missing, wrong-route and wrong-date quotes never become a comparison",()=>{
  const rows=[quote("rail","高铁"),quote("flight","航班",{date:"2026-10-29"}),quote("wrong","航班",{origin:"北京"}),quote("missing","航班",{extraFees:undefined})];
  const result=compareJourney(rows,"西安","杭州","2026-10-28",2,0);assert.equal(result.rows.length,1);assert.equal(result.comparable,false);assert.equal(result.recommended,undefined);
});
