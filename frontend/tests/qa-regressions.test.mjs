import test from "node:test";
import assert from "node:assert/strict";
import { extractIntake } from "../src/lib/conversation-intake.ts";
import { restoredWorkspaceView } from "../src/lib/workspace-view.ts";
import { beijingTime } from "../src/lib/beijing-time.ts";
import { scheduleTourism, sameTourismPlace, validateSchedule } from "../src/lib/tourism-scheduler.ts";

test("QA-004 both equipment word orders preserve total and per-group participants", () => {
  for (const text of ["每组5人，器材10套", "每组5人，10套器材", "每组5人，器材数量为十套", "每组5人，篮球10个"]) {
    const known={participants:40,activityType:"校园运动会",cityName:"杭州市"};
    const updated={...known,...extractIntake(text,"2026-10-27",known)};
    assert.equal(updated.equipmentCount,10,text);assert.equal(updated.teamSize,5,text);assert.equal(updated.participants,40,text);
  }
});
test("QA-005 restaurant aliases are one entity before and after coordinate calibration", () => {
  const restaurant={name:"楼外楼（西湖店）",address:"孤山路30号",longitude:120.140723,latitude:30.250209,category:"美食",tag:"本地菜",blurb:"正餐"};
  const alias={...restaurant,name:"楼外楼(杭州西湖风景名胜区店)"};
  assert.ok(sameTourismPlace(restaurant,alias));
  assert.ok(sameTourismPlace({...restaurant,poiId:"B123"},{...alias,poiId:"B123"}));
  assert.equal(sameTourismPlace({...restaurant,poiId:"B123"},{...alias,poiId:"B456"}),false);
  assert.equal(sameTourismPlace(restaurant,{...alias,longitude:120.2}),false);
  assert.equal(sameTourismPlace(restaurant,{...alias,name:"隔壁餐厅"}),false);
  for (const pool of [[restaurant,alias],[alias,restaurant]]) {
    const options={dates:["2026-10-28","2026-10-29"],hours:[],now:new Date("2026-10-27T00:00:00Z")};
    const result=scheduleTourism(pool,options);
    assert.equal(result.visits.length,1);
    assert.deepEqual(validateSchedule(result.visits,options),[]);
    assert.ok(validateSchedule([...result.visits,{...result.visits[0],poi:alias}],options).some(error=>error.includes("重复")));
  }
});
test("QA-006 Beijing midnight is independent of the browser's date and handles month/year boundaries", () => {
  assert.equal(beijingTime(new Date("2026-10-26T16:30:00Z")).date,"2026-10-27");
  assert.equal(beijingTime(new Date("2026-12-31T16:00:00Z")).date,"2027-01-01");
});
test("QA-007 an explicit deep link wins even after a conflicting saved view resolves", async () => {
  const saved=await Promise.resolve({workspaceView:"studio"});
  for(const view of ["archive","library","plan","map","execution"]) assert.equal(restoredWorkspaceView("?view="+view,saved.workspaceView),view);
  assert.equal(restoredWorkspaceView("?view=archive","map"),"archive");
  assert.equal(restoredWorkspaceView("?view=studio","archive"),"studio");
  assert.equal(restoredWorkspaceView("?view=invalid","archive"),"studio");
  assert.equal(restoredWorkspaceView("","archive"),"archive");
});
