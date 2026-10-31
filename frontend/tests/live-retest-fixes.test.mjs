import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherChartRequest} from '../src/lib/visualization-request.ts';
import {applyMemoryIntent,emptyContext,appendContextMessage,restoreContext,promptContext} from '../src/lib/conversation-context.ts';
import {selectCityIntroductionSources} from '../src/lib/city-introduction.ts';
test('relative chart dates and metrics preserve confirmed city; explicit change replaces it',()=>{
 const known={cityName:'杭州市',date:'2026-10-30'};
 for(const text of ['画明天的气温图','画后天的气温图','画下周的气温图']) {
  const spec=weatherChartRequest(text,known,'2026-10-29');
  if(spec) assert.equal(spec.cityName,'杭州市');
 }
 const first=weatherChartRequest('画明天的气温图',known,'2026-10-29');
 assert.deepEqual(first.dates,['2026-10-30']);
 assert.equal(weatherChartRequest('改画北京的气温图',known,'2026-10-29',first).cityName,'北京市');
 assert.deepEqual(weatherChartRequest('只看降雨',known,'2026-10-29',first)?.metrics,['rainProbability']);
 assert.equal(weatherChartRequest('介绍杭州',known,'2026-10-29',first),null);
});
test('nested corrections survive mixed topics and restoration, forgetting erases old values',()=>{
 let ctx=emptyContext();
 for(const text of ['记住暗号是旧值739','请记住暗号改成青松白鹭852','麻烦帮我记住暗号改为白鹭853','请把暗号更新为白鹭854']) ctx=applyMemoryIntent(ctx,text).context;
 assert.deepEqual(ctx.facts,[{key:'暗号',value:'白鹭854'}]);
 applyMemoryIntent(ctx,'不要记住暗号改成错误值');
 const topics=['杭州明天天气','介绍西安','AQI是什么','改画北京气温','只看降雨','学生运动要注意什么'];
 for(let i=0;i<30;i++) {
  appendContextMessage(ctx,{id:'u'+i,role:'user',content:topics[i%topics.length]});
  appendContextMessage(ctx,{id:'a'+i,role:'assistant',content:'本轮话题'+i});
 }
 ctx=restoreContext(JSON.parse(JSON.stringify(ctx)),[]);
 assert.match(applyMemoryIntent(ctx,'暗号是什么？').reply,/白鹭854/);
 ctx=applyMemoryIntent(ctx,'请忘记暗号').context;
 assert.equal(ctx.facts.length,0);assert.ok(!JSON.stringify(promptContext(ctx)).includes('白鹭854'));
 assert.equal(emptyContext().facts.length,0);
 assert.equal(applyMemoryIntent(ctx,'清空当前对话记忆').context.recent.length,0);
});
test('city overview rejects street evidence and deduplicates city sources',()=>{
 const city={title:'杭州市城市概况',excerpt:'杭州位于浙江省，是浙江省省会。',url:'https://example.org/city'};
 const street={title:'杭州高银美食街简介',excerpt:'杭州高银街位于上城区。',url:'https://example.org/street'};
 assert.deepEqual(selectCityIntroductionSources([street,city,city],'杭州市'),[city]);
});
