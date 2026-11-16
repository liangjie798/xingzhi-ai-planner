import test from 'node:test';
import assert from 'node:assert/strict';
import {extractIntake,completeIntake,relativeDateFromText} from '../src/lib/conversation-intake.ts';
import {journeyLocations} from '../src/lib/journey.ts';
import {emptyContext,applyMemoryIntent} from '../src/lib/conversation-context.ts';
import {confirmationOnly,indoorAlternative,casualGreeting,memoryAssignments} from '../src/lib/conversation-semantics.ts';
const today='2026-11-01';
const read=(s,known={})=>extractIntake(s,today,known);
test('affirmative destination replaces rejected city without contaminating origin',()=>{
 const v=read('我不去北京，我想去南京旅游，明天，两个人。');assert.match(v.cityName,/南京/);assert.equal(v.originCity,undefined);
 assert.match(read('不是杭州，改去苏州，其他条件不变。',{cityName:'杭州'}).cityName,/苏州/);
});
test('positive correction wins for Chinese and Arabic people and day counts',()=>{
 for(const [old,n] of [['五','六'],['5','6']]) assert.equal(read(`人数不是${old}人，是${n}人。`).participants,6);
 for(const [old,n] of [['三','两'],['3','2']]) assert.equal(read(`不玩${old}天了，改成${n}天。`).tripDays,2);
 const c=completeIntake({date:'2026-11-02',endDate:'2026-11-04',tripDays:3},read('不玩三天了，改成两天。'),today);assert.equal(c.intake.known.endDate,'2026-11-03');
});
test('adult and child counts sum without counting per-group numbers',()=>{
 for(const text of ['两个大人带一个孩子','2个大人带1个孩子']){assert.equal(read(text).participants,3);assert.equal(read(text).audienceDescription,'亲子家庭');}
});
test('budgets distinguish total and per-person, retaining total on headcount changes',()=>{
 assert.equal(read('人均预算八百元').budgetPerPerson,800);assert.equal(read('人均预算800元').budgetPerPerson,800);
 const delta=read('总预算3000元，不是人均3000元。',{participants:6});assert.equal(delta.totalBudget,3000);assert.equal(delta.budgetPerPerson,500);
 const c=completeIntake({participants:6,totalBudget:3000,budgetPerPerson:500},{participants:5},today);assert.equal(c.intake.known.budgetPerPerson,600);
});
test('weekdays use calendar weeks including Sunday and year boundary',()=>{
 assert.equal(relativeDateFromText('下周一',today),'2026-11-02');assert.equal(relativeDateFromText('下周日',today),'2026-11-08');assert.equal(relativeDateFromText('下下周一',today),'2026-11-09');assert.equal(relativeDateFromText('下周一','2026-12-31'),'2027-01-04');
});
test('locations exclude date, comparison prefix, trailing particle and play verb',()=>{
 assert.equal(read('明天去杭州市旅游，5个成年人，玩3天。').cityName,'杭州市');
 assert.equal(read('后天从西安出发去杭州玩三天').cityName,'杭州');
 assert.deepEqual(journeyLocations('只比较西安到北京的高铁和飞机'),{originCity:'西安',destination:'北京'});
 assert.equal(journeyLocations('明年一月二日去西安旅行').originCity,undefined);
});
test('multi-item memory splits only unquoted independent assignments',()=>{
 let c=emptyContext();c=applyMemoryIntent(c,'请记住：暗号是晴川7316，酒店是海风客栈。').context;assert.equal(c.facts.length,2);assert.equal(c.facts[0].value,'晴川7316');
 const before=JSON.stringify(c.facts);applyMemoryIntent(c,'不要把暗号改成海浪8524。');assert.equal(JSON.stringify(c.facts),before);
 assert.match(applyMemoryIntent(c,'集合地点和暗号分别是什么？').reply,/集合地点.*没有找到/);
 assert.deepEqual(memoryAssignments('便签是“暗号是甲，酒店是乙”'),['便签是“暗号是甲，酒店是乙”']);
});
test('confirmation, contingency and casual chat are distinct intents',()=>{
 for(const s of ['先别生成，帮我复述目前条件','先不要生成路线，只确认信息。','先别查，还没确定日期。'])assert.ok(confirmationOnly(s));
 assert.ok(indoorAlternative('如果下雨有什么室内替代方案？先不要改变原安排。'));
 assert.ok(casualGreeting('你好呀，今天心情不错，想随便聊两句。'));assert.equal(casualGreeting('你好，明天去旅游帮我规划'),false);
});
