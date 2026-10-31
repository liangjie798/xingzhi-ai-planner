import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleTourism } from '../src/lib/tourism-scheduler.ts';
import { classifyConversation, isWeatherFollowup } from '../src/lib/conversation-knowledge.ts';
import { selectCityIntroductionSources } from '../src/lib/city-introduction.ts';
import { airQualityNote } from '../src/lib/air-quality-provenance.ts';
import { ticketFailureNote } from '../src/lib/ticket-failure.ts';
import { searchTickets } from '../src/lib/ticket-search-server.ts';

test('repeated 09:00 cannot cover a missing 10:00 forecast; duplicate adverse data is not discarded',()=>{
 const date='2026-11-01',h={date,hour:9,temperature:20,humidity:50,rainProbability:0,aqi:40,heatRisk:5};
 const poi={name:'湖边公园',longitude:120,latitude:30,category:'景点',tag:'公园',blurb:'测试'};
 const options={dates:[date],allowedStartHour:9,allowedEndHour:11,now:new Date('2026-10-30T00:00:00Z')};
 const incomplete=scheduleTourism([poi],{...options,hours:[h,{...h}]});
 assert.equal(incomplete.visits.length,1);
 assert.match(incomplete.visits[0].weatherAssessment,/不完整.*待复核/);
 assert.ok(incomplete.warnings.some(text=>/预报不完整.*未完成天气筛选/.test(text)));
 const blocked=scheduleTourism([poi],{...options,hours:[h,{...h,rainProbability:100},{...h,hour:10}]});
 assert.equal(blocked.visits.length,0);
 const reused=scheduleTourism([poi],{...options,hours:[h,{...h,hour:10,airQualityReused:true,airQualitySourceDate:'2026-10-31'}]});
 assert.match(reused.visits[0].weatherAssessment,/复用.*2026-10-31/);
});

test('air quality provenance exposes source dates and stays quiet for independent forecasts',()=>{
 assert.equal(airQualityNote([{airQualityReused:false}]),'');
 const text=airQualityNote([{airQualityReused:true,airQualitySourceDate:'2026-11-01'},{airQualityReused:true,airQualitySourceDate:'2026-10-31'}]);
 assert.match(text,/空气质量.*复用/);assert.match(text,/2026-10-31、2026-11-01/);
 assert.ok(!airQualityNote([{airQualityReused:true,airQualitySourceDate:'<script>'}]).includes('<script>'));
});

test('concept questions use knowledge even with a pending plan or previous weather answer',()=>{
 for(const text of ['什么是AQI？','什么是PM2.5？','解释空气质量指数','降雨概率的含义是什么？']) {
  assert.equal(classifyConversation(text,true),'knowledge');
  assert.equal(isWeatherFollowup(text,'杭州市 天气预报（北京时间）'),false);
 }
 assert.equal(classifyConversation('杭州明天AQI多少？'),'weather');
});

test('city overview selection rejects local news about trees, streets and specific policies',()=>{
 const rows=[{title:'杭州市城市概况',excerpt:'杭州位于浙江省，是浙江省省会。',url:'https://example.org/city'},
 {title:'杭州统筹古树名木保护与历史文脉传承',excerpt:'杭州古树保护文化行动。',url:'https://example.org/news'},
 {title:'杭州高银美食街简介',excerpt:'杭州高银美食街位于上城区。',url:'https://example.org/street'}];
 assert.deepEqual(selectCityIntroductionSources(rows,'杭州市'),[rows[0]]);
 assert.deepEqual(selectCityIntroductionSources(rows.slice(1),'杭州市'),[]);
});

test('ticket failures disclose safe actionable classifications rather than upstream secrets',()=>{
 assert.match(ticketFailureNote(new Error('login-required'),'航班'),/要求登录/);
 assert.match(ticketFailureNote(new Error('verification-required'),'火车'),/人工验证/);
 assert.match(ticketFailureNote(new Error('unsupported'),'航班'),/尚未接入/);
 assert.match(ticketFailureNote(new DOMException('timed out','TimeoutError'),'火车'),/超时/);
 assert.ok(!ticketFailureNote(new Error('secret-key-and-private-url'),'火车').includes('secret-key'));
});

test('disabled browser queries fail without fetching or inventing prices',async()=>{
 const originalFetch=globalThis.fetch,old=process.env.AIRLINE_BROWSER_ENABLED;
 process.env.AIRLINE_BROWSER_ENABLED='0';let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not fetch');};
 try{const date=new Date(Date.now()+86400000).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});const result=await searchTickets('杭州市','北京市',date);assert.equal(result.status,'not-configured');assert.deepEqual(result.options,[]);assert.equal(calls,0);}
 finally{globalThis.fetch=originalFetch;if(old===undefined)delete process.env.AIRLINE_BROWSER_ENABLED;else process.env.AIRLINE_BROWSER_ENABLED=old;}
});
