import test from 'node:test';
import assert from 'node:assert/strict';
import {positiveFare,parseAirlinePage,airlinePageBarrier,confirmedEmptyAirlinePage} from '../src/lib/airline-parsing.ts';
import {AIRLINE_PROVIDERS,ACTIVE_AIRLINE_CODES,DEFAULT_AIRLINE_CODES,chooseAirlines} from '../src/lib/airline-providers.ts';
import {validateFlightQuery,searchAirlineFlights,streamAirlineFlights} from '../src/lib/airline-search-server.ts';
import {airlineCoverage,executeAirlineTool,FLIGHT_SEARCH_TOOL} from '../src/lib/airline-tools-server.ts';
import {runAirlineAgent} from '../src/lib/airline-agent-server.ts';
import {searchTickets,summarizeTickets} from '../src/lib/ticket-search-server.ts';
import {stationCandidates} from '../src/lib/train-search-server.ts';
import {composeTrainTransfers} from '../src/lib/train-search-server.ts';
import {isTransportQuestion,journeyLocations} from '../src/lib/journey.ts';
const input={origin:'厦门',destination:'北京',date:'2026-10-31'};
const query=validateFlightQuery(input,'2026-10-30');
const provider=AIRLINE_PROVIDERS.find(p=>p.code==='MF');
const page={url:provider.url(query),text:'具体航班',pageDate:input.date,originLabel:'厦门',destinationLabel:'北京大兴',rows:[{text:'MF8103\n21:00\n厦门\n直飞\n23:40\n北京大兴\n经济舱\n¥680',flightNumber:'MF8103',priceText:'680',cabin:'经济舱'}]};
test('transport direction and date prefixes remain correct',()=>{assert.deepEqual(journeyLocations('明天厦门到北京查询机票'),{originCity:'厦门',destination:'北京'});assert.equal(isTransportQuestion('查询明天的机票'),true);assert.deepEqual(journeyLocations('明天西安到榆林怎么走便宜'),{originCity:'西安',destination:'榆林'});});
test('directory, sample success and active adapters are distinct',()=>{const c=airlineCoverage();assert.equal(c.totalEntities,65);assert.equal(c.sampleQuoteObserved,16);assert.deepEqual(ACTIVE_AIRLINE_CODES,['MF','KN','SC','CZ','RY','GS','9H']);assert.equal(c.airlines.find(r=>r.code==='CA').adapterRegistered,false);});
test('flight search selects up to four reliable hub-relevant airlines',()=>{
  assert.deepEqual(DEFAULT_AIRLINE_CODES,['MF','CZ','KN','SC','RY','GS','MU','9H']);
  const xiamen=chooseAirlines(validateFlightQuery({origin:'厦门',destination:'北京',date:'2026-11-20'},'2026-11-12'));
  assert.deepEqual(xiamen.map(a=>a.code),['MF','KN','CZ','SC']);
  const xian=chooseAirlines(validateFlightQuery({origin:'西安',destination:'北京',date:'2026-11-20'},'2026-11-12'));
  assert.deepEqual(xian.map(a=>a.code),['KN','MF','CZ','SC']);
});
test('strict query validation rejects arbitrary URLs, unknown airports and date overflow',()=>{assert.throws(()=>validateFlightQuery({...input,url:'http://127.0.0.1'},'2026-10-30'));assert.throws(()=>validateFlightQuery({...input,date:'2026-02-30'},'2026-01-01'));assert.throws(()=>validateFlightQuery({...input,origin:'某县'},'2026-10-30'));assert.throws(()=>validateFlightQuery({...input,airlineCodes:['CA']},'2026-10-30'));assert.throws(()=>validateFlightQuery({...input,date:'2027-10-31'},'2026-10-30'));assert.equal(validateFlightQuery({...input,airlineCodes:['MF','KN','SC','CZ']},'2026-10-30').airlineCodes.length,4);assert.throws(()=>validateFlightQuery({...input,airlineCodes:['MF','KN','SC','CZ','RY']},'2026-10-30'));});
test('finite positive fares only; calendar numbers are never accepted as a quote',()=>{for(const v of ['Infinity',Infinity,0,-1,'¥100','100元','1e3',null])assert.equal(positiveFare(v),undefined);assert.equal(positiveFare('1,234.50'),1234.5);assert.equal(parseAirlinePage(provider,query,{...page,rows:[]},new Date().toISOString()).quotes.length,0);});
test('row quote requires matching date, route, cabin and official origin',()=>{assert.equal(parseAirlinePage(provider,query,page,new Date().toISOString()).quotes[0].price,680);for(const change of [{pageDate:'2026-11-01'},{destinationLabel:'上海'},{url:'https://evil.example/'},{rows:[{...page.rows[0],priceText:'Infinity'}]}])assert.equal(parseAirlinePage(provider,query,{...page,...change},new Date().toISOString()).quotes.length,0);assert.equal(parseAirlinePage(provider,query,page,new Date().toISOString()).quotes[0].priceBasis,'unknown');});
test('access barriers win over prices, while a captcha help article is not a challenge',()=>{assert.equal(airlinePageBarrier('关于登录滑块验证码操作的提示','https://example.com'),undefined);for(const text of ['请依次点击','请先登录官网再进行操作','会话已过期'])assert.equal(parseAirlinePage(provider,query,{...page,text},new Date().toISOString()).quotes.length,0);});
test('early empty-result completion requires a verified route and date, not loading text',()=>{
  const empty={...page,text:'暂无符合条件的航班',rows:[]};
  assert.equal(confirmedEmptyAirlinePage(provider,query,empty),true);
  for(const change of [{pageDate:'2026-11-02'},{originLabel:'上海'},{destinationLabel:'上海'},{text:'正在查询，暂无航班'},{text:'请完成验证，暂无航班'},{url:'https://example.org/'}])assert.equal(confirmedEmptyAirlinePage(provider,query,{...empty,...change}),false);
  assert.equal(confirmedEmptyAirlinePage(provider,query,{...page,text:'暂无航班仅为页面帮助说明'}),false);
});
test('a neighbouring business fare or another flight cannot replace an unavailable economy seat',()=>{const mu=AIRLINE_PROVIDERS.find(p=>p.code==='MU');const q=validateFlightQuery({origin:'上海',destination:'北京',date:input.date},'2026-10-30');const p={...page,url:mu.url(q),originLabel:'上海',rows:[{text:'MU5099\n07:00\n09:20\n航班详情\n— —\n¥2100'}]};assert.equal(parseAirlinePage(mu,q,p,new Date().toISOString()).quotes.length,0);assert.equal(parseAirlinePage(provider,query,{...page,rows:[{...page.rows[0],text:page.rows[0].text+'\nMF8105'}]},new Date().toISOString()).quotes.length,0);});
test('train transfer composition respects same-station and cross-station buffers',()=>{
  const inbound={mode:'火车',service:'G1900',seat:'二等座',price:300,departure:'08:00',arrival:'10:00',durationMinutes:120,originStation:'西安北',destinationStation:'郑州东',arrivalDayOffset:0};
  const outbound={mode:'火车',service:'G1901',seat:'二等座',price:200,departure:'11:00',arrival:'13:00',durationMinutes:120,originStation:'郑州东',destinationStation:'北京西',arrivalDayOffset:0};
  const composed=composeTrainTransfers([inbound],[outbound]);
  assert.equal(composed.length,1);
  assert.equal(composed[0].service,'G1900+G1901');
  assert.equal(composed[0].price,500);
  assert.equal(composed[0].stops,1);
  assert.match(composed[0].seat,/中转/);
  assert.equal(composeTrainTransfers([inbound],[{...outbound,departure:'10:20'}]).length,0);
  assert.equal(composeTrainTransfers([inbound],[{...outbound,originStation:'郑州'}]).length,0);
  assert.equal(composeTrainTransfers([inbound],[{...outbound,departure:'10:41'}]).length,1);
  assert.equal(composeTrainTransfers([{...inbound,arrivalDayOffset:1}],[outbound]).length,0);
});
test('city names expand to same-city 12306 stations, while a concrete station stays exact',()=>{  const map=new Map([['北京','BJP'],['北京南','VNP'],['北京西','BXP'],['北京北','VAP'],['北京丰台','FTP'],['厦门','XMS'],['厦门北','XKS'],['香港西九龙','XJA']]);
  assert.deepEqual(stationCandidates(map,'北京'),['北京','北京南','北京西','北京北','北京丰台']);
  assert.deepEqual(stationCandidates(map,'北京市'),['北京','北京南','北京西','北京北','北京丰台']);
  assert.deepEqual(stationCandidates(map,'北京南站'),['北京南']);
  assert.deepEqual(stationCandidates(map,'厦门'),['厦门','厦门北']);
  assert.deepEqual(stationCandidates(map,'香港'),['香港西九龙']);
  assert.deepEqual(stationCandidates(map,'不存在'),[]);
  assert.deepEqual(stationCandidates(map,''),[]);
});
test('disabled browser and train-only requests do not invent quotes',async()=>{const old=process.env.AIRLINE_BROWSER_ENABLED;process.env.AIRLINE_BROWSER_ENABLED='0';try{const date=new Date(Date.now()+86400000).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});const r=await searchTickets('厦门','北京',date);assert.equal(r.status,'not-configured');assert.deepEqual(r.options,[]);const train=await searchTickets('厦门','北京',date,{mode:'火车'});assert.deepEqual(train.options,[]);assert.match(train.reply,/12306/);}finally{if(old===undefined)delete process.env.AIRLINE_BROWSER_ENABLED;else process.env.AIRLINE_BROWSER_ENABLED=old;}});
test('tool dispatcher is read-only and rejects unknown tools and arguments',async()=>{await assert.rejects(executeAirlineTool('buy_ticket',{}));await assert.rejects(executeAirlineTool('list_airline_coverage',{url:'x'}));assert.equal((await executeAirlineTool('list_airline_coverage',{})).totalEntities,65);});
test('real function-calling protocol is used, and changed confirmed slots fail closed',async()=>{const original=global.fetch,key=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='test-only';const date=new Date(Date.now()+86400000).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});let sent,executed;const current={origin:'厦门',destination:'北京',date};const executor=async q=>{executed=q;return { ...q,status:'unavailable',quotes:[],providers:[],notes:[],checkedAt:new Date().toISOString()};};try{global.fetch=async(url,init)=>{sent=JSON.parse(init.body);return Response.json({model:'actual-returned-model',choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:FLIGHT_SEARCH_TOOL.function.name,arguments:JSON.stringify(current)}}]}}]});};const r=await runAirlineAgent(current,{useModel:true,executor});assert.equal(sent.tools[0].function.name,'search_domestic_flights');assert.equal(r.modelCall.model,'actual-returned-model');assert.equal(r.modelCall.success,true);assert.deepEqual(executed,current);global.fetch=async()=>Response.json({choices:[{message:{tool_calls:[{type:'function',function:{name:'search_domestic_flights',arguments:JSON.stringify({...current,destination:'上海'})}}]}}]});const rejected=await runAirlineAgent(current,{useModel:true,executor});assert.equal(rejected.modelCall.success,false);assert.deepEqual(executed,current);}finally{global.fetch=original;if(key===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=key;}});
test('unknown taxes and missing train data never become a cheapest-total claim',()=>{const text=summarizeTickets([{mode:'航班',service:'MF8103',seat:'官网展示',price:680,priceBasis:'unknown'}],[]);assert.match(text,/不能据此判断含税最低价/);assert.match(text,/不能判断航班比火车更便宜/);});
test('a slow airline times out independently while later airlines still return verified quotes',async()=>{
  const calls=[];
  const result=await searchAirlineFlights({...input,date:'2026-11-04',airlineCodes:['9H','MF']},{today:'2026-10-31',providerTimeoutMs:15,probe:async(p,q,signal)=>{
    calls.push(p.code);
    if(p.code==='9H')await new Promise(resolve=>{const keepAlive=setTimeout(resolve,100);signal.addEventListener('abort',()=>{clearTimeout(keepAlive);resolve();},{once:true});});
    const quotes=p.code==='MF'?[{airlineCode:'MF',date:q.date,price:680,currency:'CNY'}]:[];
    return {attempt:{airlineCode:p.code,sourceName:p.name,sourceUrl:p.home,state:quotes.length?'quoted':'cancelled',quoteCount:quotes.length,checkedAt:new Date().toISOString()},quotes};
  }});
  assert.deepEqual(calls,['9H','MF']);assert.equal(result.providers[0].state,'timeout');assert.equal(result.providers[1].state,'quoted');assert.equal(result.quotes[0].price,680);
});
test('southern airline DOM rows become verified quotes',()=>{const cz=AIRLINE_PROVIDERS.find(p=>p.code==='CZ');const q=validateFlightQuery({origin:'厦门',destination:'北京',date:'2026-11-14'},'2026-11-12');const page={url:'https://b2c.csair.com/B2C40/newTrips/static/main/page/booking/index.html',text:'CZ3880 16:30 00:05+1天 经济舱 1010',pageDate:'2026-11-14',originLabel:'厦门',destinationLabel:'北京',rows:[{text:'CZ3880 厦门高崎国际机场 北京大兴国际机场 1010',flightNumber:'CZ3880',priceText:'1010',cabin:'经济舱 · 官网展示价',departure:'16:30',arrival:'00:05',departureDate:'20261114',arrivalDate:'20261115',originCode:'XMN',destinationCode:'PKX',originStation:'厦门高崎国际机场',destinationStation:'北京大兴国际机场',stops:0}]};const parsed=parseAirlinePage(cz,q,page,'2026-11-14T00:00:00.000Z');assert.equal(parsed.quotes.length,1);assert.equal(parsed.quotes[0].flightNumber,'CZ3880');assert.equal(parsed.quotes[0].price,1010);assert.equal(parsed.quotes[0].arrivalDayOffset,1);});
test('flight stream emits fast airlines before slow ones and covers six airlines',async()=>{
  const startedAt=Date.now();
  const events=[];
  let firstProviderAt=null;
  const probe=async(provider,query)=>{
    await new Promise(resolve=>setTimeout(resolve,provider.code==='CZ'?140:10));
    return {attempt:{airlineCode:provider.code,sourceName:provider.name,state:'quoted',sourceUrl:provider.home,checkedAt:new Date().toISOString(),quoteCount:1},quotes:[{airlineCode:provider.code,sourceName:provider.name,flightNumber:provider.code+'8888',departure:'09:00',arrival:'11:00',cabin:'经济舱 · 官网展示价',price:520,currency:'CNY',priceBasis:'unknown',availability:'display-only',codeshare:false,sourceUrl:provider.home,checkedAt:new Date().toISOString(),date:query.date}]};
  };
  for await(const event of streamAirlineFlights({origin:'上海',destination:'北京',date:'2026-11-23'},{today:'2026-11-12',probe,overallTimeoutMs:5000})){
    events.push(event);
    if(event.type==='provider'&&firstProviderAt===null)firstProviderAt=Date.now()-startedAt;
  }
  const elapsed=Date.now()-startedAt;
  assert.equal(events[0].type,'start');
  assert.equal(events[0].providers.length,8);
  assert.equal(events.at(-1).type,'done');
  const providerEvents=events.filter(event=>event.type==='provider');
  assert.equal(providerEvents.length,8);
  assert.ok(firstProviderAt!==null&&firstProviderAt<90,`first provider at ${firstProviderAt}ms`);
  assert.ok(elapsed>=130,`slow provider should delay total to >=130ms, got ${elapsed}ms`);
  assert.ok(providerEvents.some(event=>event.attempt.airlineCode==='CZ'));
  assert.equal(events.at(-1).quoteCount,8);
  assert.equal(events.at(-1).status,'partial');
});

test('airline probes run in parallel and merged quotes stay attributed',async()=>{  let active=0,maxActive=0;
  const probe=async(provider,query)=>{
    active++;maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,60));
    active--;
    return {attempt:{airlineCode:provider.code,sourceName:provider.name,state:'quoted',sourceUrl:provider.home,checkedAt:new Date().toISOString(),quoteCount:1},quotes:[{airlineCode:provider.code,sourceName:provider.name,flightNumber:provider.code+'1234',departure:'08:00',arrival:'10:00',cabin:'经济舱 · 官网展示价',price:680,currency:'CNY',priceBasis:'unknown',availability:'display-only',codeshare:false,sourceUrl:provider.home,checkedAt:new Date().toISOString(),date:query.date}]};
  };
  const started=Date.now();
  const result=await searchAirlineFlights({origin:'上海',destination:'北京',date:'2026-11-21'},{today:'2026-11-12',probe});
  const elapsed=Date.now()-started;
  assert.ok(maxActive>=3,`expected parallel probes, max concurrency ${maxActive}`);
  assert.ok(elapsed<400,`parallel probes took ${elapsed}ms`);
  assert.equal(result.providers.length,4);
  assert.equal(result.quotes.length,4);
  assert.deepEqual([...new Set(result.quotes.map(quote=>quote.airlineCode))].sort(),['CZ','KN','MF','SC']);
});
