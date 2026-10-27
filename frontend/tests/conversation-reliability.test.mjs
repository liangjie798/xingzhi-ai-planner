import test from "node:test";
import assert from "node:assert/strict";
import { conversationInputError, isCourtesy, isModelQuestion } from "../src/lib/conversation-validation.ts";
import { weatherChartRequest } from "../src/lib/visualization-request.ts";
import { journeyLocations } from "../src/lib/journey.ts";
import { scoreContributions, explainScoreDifference, isScoreQuestion } from "../src/lib/score-explanation.ts";

const today = "2026-10-27";
test("invalid edits stop before old values can be reused", () => {
  assert.match(conversationInputError("活动时长改成1.5小时，其他不变", today), /90分钟/);
  assert.match(conversationInputError("日期改成2月30日，其他不变", today), /没有30号/);
  assert.match(conversationInputError("人数改成0人，其他不变", today), /人数必须/);
  assert.equal(conversationInputError("活动改成2小时，40人", today), undefined);
});
test("courtesy and model queries are recognized before location extraction", () => {
  assert.ok(isCourtesy("谢谢！")); assert.ok(isModelQuestion("你是什么模型？"));
  assert.deepEqual(journeyLocations("目的地改成北京。"), {originCity:undefined,destination:"北京"});
  assert.equal(journeyLocations("只看火车。").destination, undefined);
});
test("weather question to chart uses weather city and explicit dates", () => {
  const chart = weatherChartRequest("把明天和后天的气温画成对比图。", {cityName:"西安市",date:"2026-10-28"}, today);
  assert.equal(chart.cityName,"西安市"); assert.deepEqual(chart.dates,["2026-10-28","2026-10-29"]);
});
test("chart city and date revisions do not mutate activity conditions", () => {
  const known = {cityName:"杭州市",date:"2026-10-28",endDate:"2026-10-29"};
  const chart = weatherChartRequest("把两天的气温和降雨概率放在一起比较，画出对比图。", known, today);
  const beijing = weatherChartRequest("改画北京的气温对比图，活动方案保持不变。", known, today, chart);
  assert.equal(beijing.cityName,"北京市"); assert.deepEqual(beijing.dates,chart.dates); assert.deepEqual(beijing.metrics,["temperature"]);
  const revised = weatherChartRequest("把绘图日期改为10月30日和11月1日",known,today,beijing);
  assert.equal(revised.cityName,"北京市"); assert.deepEqual(revised.dates,["2026-10-30","2026-11-01"]);
  assert.equal(known.cityName,"杭州市"); assert.equal(known.date,"2026-10-28");
});
test("score explanation uses real slots, corrects premise and reconciles deductions", () => {
  const input = {date:"2026-10-28",duration:2,group:"儿童青少年",activityType:"校园运动会"};
  const slot = {date:"2026-10-28",hour:14,label:"14:00",temperature:18,aqi:55,heatRisk:10,rainProbability:20,score:70};
  const parts = scoreContributions(slot,input);
  assert.equal(Math.round(100-Object.values(parts).reduce((a,b)=>a+b,0)),70);
  const next = {...slot,date:"2026-10-29",rainProbability:10,score:72};
  const message = "为什么10月29日下午的分数比10月28日更低？";
  assert.ok(isScoreQuestion(message));
  const reply=explainScoreDifference(message,input,{slots:[slot,next]});
  assert.match(reply,/2026-10-29比2026-10-28高2分/); assert.match(reply,/降雨3.60/); assert.match(reply,/14:00–16:00/);
  assert.match(explainScoreDifference("为什么10月30日评分更低",input,{slots:[slot,next]}),/没有这些日期/);
});
