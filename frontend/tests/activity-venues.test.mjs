import test from "node:test";
import assert from "node:assert/strict";
import { recommendActivityVenues } from "../src/lib/activity-venues.ts";
import { planningReferences } from "../src/lib/planning-references.ts";
const input = { activityType:"研学活动", group:"儿童青少年", participants:100, duration:6, intensity:"高强度" };
const poi = (id,name,type) => ({ id,name,type, address:"候选场地地址", longitude:108.9,latitude:34.2 });
test("activities select distinct venue types and include concrete reasons and group constraints", () => {
  const candidates = [poi("1","西安博物院","博物馆"),poi("2","科技馆","科教文化"),poi("3","城市体育场","体育场"),poi("4","社区文化活动中心","文化中心"),poi("5","体育用品店","体育场"),poi("6","旅行社公司博物馆","博物馆")];
  const study = recommendActivityVenues(candidates,input,true);
  assert.deepEqual(new Set(study.map(venue=>venue.name)),new Set(["西安博物院","科技馆"]));
  assert.match(study[0].checks,/100人/); assert.match(study[0].checks,/接待|容纳/); assert.match(study[0].task,/6小时/);
  assert.match(study[0].reason,/观察|知识|主题/);
  const sports = recommendActivityVenues(candidates,{...input,activityType:"校园运动会"});
  assert.deepEqual(sports.map(venue=>venue.name),["城市体育场"]);
  const community = recommendActivityVenues(candidates,{...input,activityType:"社区活动"});
  assert.deepEqual(community.map(venue=>venue.name),["社区文化活动中心"]);
});
test("main document references are short, deduplicated and exclude promotional search paragraphs", () => {
  const evidence = Array.from({length:5},(_,index)=>({ title:"同一标准"+index, sourceUrl:"https://example.com/policy", excerpt:"政策说明".repeat(100),tag:"政策依据" }));
  const social = { items:[{title:"TOP3旅行社测评",excerpt:"广告".repeat(200),url:"https://example.com/ad"},{title:"城市研学活动案例",excerpt:"案例".repeat(200),url:"https://example.com/case"},{title:"重复案例",excerpt:"",url:"https://example.com/case"}], sources:[],durationMs:0 };
  const refs = planningReferences(evidence,social);
  assert.equal(refs.length,2); assert.ok(refs.every(ref=>ref.note.length<=90));
  assert.ok(!JSON.stringify(refs).includes("TOP3")); assert.ok(JSON.stringify(refs).length<500);
});
