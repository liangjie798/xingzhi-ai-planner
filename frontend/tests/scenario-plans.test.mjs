import test from "node:test";
import assert from "node:assert/strict";
import {scenarioPlan,resourceConflicts,budgetSummary} from "../src/lib/scenario-plans.ts";
import {planChanges} from "../src/lib/workspace-data.ts";
const input={participants:40,group:"普通人群",audienceDescription:"大学生",duration:2,teamSize:5,equipmentCount:10};
test("six scenes produce distinct concrete deliverables and venue-specific study tasks",()=>{
  const scenes=["旅游规划","研学活动","校园运动会","体育课","社区活动","户外训练"];
  assert.equal(new Set(scenes.map(activityType=>JSON.stringify(scenarioPlan({...input,activityType},{venues:[{name:"科技馆"}]})))).size,6);
  assert.match(JSON.stringify(scenarioPlan({...input,activityType:"研学活动"},{venues:[{name:"科技馆"}]})),/预测.*现象/);
  const lesson=JSON.stringify(scenarioPlan({...input,activityType:"体育课"},null));assert.match(lesson,/8个器材练习站/);assert.match(lesson,/1轮/);
  assert.match(JSON.stringify(scenarioPlan({...input,equipmentCount:undefined,activityType:"体育课"},null)),/器材数量未知/);
});
test("sports conflicts distinguish overlapping personnel/venues from adjacent or other-day events",()=>{
  const base={id:"1",date:"2026-10-28",start:"09:00",end:"10:00",title:"赛跑",venue:"场地1",owner:"裁判1",people:"学生1,学生2"};
  assert.equal(resourceConflicts([base,{...base,id:"2",title:"跳远",start:"09:30",end:"10:30",venue:"场地2",owner:"裁判2",people:"学生2"}]).length,1);
  assert.equal(resourceConflicts([base,{...base,id:"2",start:"10:00",end:"11:00"}]).length,0);assert.equal(resourceConflicts([base,{...base,id:"2",date:"2026-10-29"}]).length,0);assert.equal(resourceConflicts([{...base,start:"11:00"}]).length,1);
});
test("costs preserve estimates and version comparison explains condition changes",()=>{
  const budget=budgetSummary([{id:"x",label:"餐饮",quantity:7,unitPrice:50,status:"估算"}],7,40);
  assert.equal(budget.total,350);assert.equal(budget.perPerson,50);assert.equal(budget.overBudget,true);assert.equal(budget.unconfirmed,1);
  const a={input:{...input,participants:7,duration:2},route:{stops:[]}},b={input:{...input,participants:10,duration:1},route:{stops:[]}};
  assert.ok(planChanges(a,b).some(text=>text.includes("人数：7 → 10")));assert.ok(planChanges(a,b).some(text=>text.includes("时长：2 → 1")));
});
