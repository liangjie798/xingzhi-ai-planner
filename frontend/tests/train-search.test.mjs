import test from 'node:test';
import assert from 'node:assert/strict';
import {searchTrains} from '../src/lib/train-search-server.ts';
test('official train response requires matching stations, timetable and positive cabin price',async()=>{
 const previous=global.fetch;const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});const row=Array(36).fill('');Object.assign(row,{2:'train-no',3:'G123',6:'BJP',7:'SHH',8:'08:00',9:'12:30',10:'04:30',16:'01',17:'02',30:'有',35:'O'});
 try{global.fetch=async url=>String(url).includes('station_name')?new Response('@bjb|北京|BJP|x|@sh|上海|SHH|x|'):String(url).endsWith('/init')?new Response("var CLeftTicketUrl = 'leftTicket/queryG';"):Response.json(String(url).includes('queryTicketPrice')?{data:{O:'¥553.00'}}:{data:{result:[row.join('|')],map:{BJP:'北京',SHH:'上海'}}});
 const r=await searchTrains('北京','上海',date);assert.equal(r.options[0].price,553);assert.equal(r.options[0].departure,'08:00');assert.equal(r.options[0].durationMinutes,270);
 global.fetch=async()=>new Response('<html>access restricted</html>');assert.equal((await searchTrains('北京','上海',new Date(Date.parse(date)+86400000).toISOString().slice(0,10))).options.length,0);
 }finally{global.fetch=previous;}
});

test('successful rail results reuse the bounded cache without another official request',async()=>{const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),previous=global.fetch;try{global.fetch=async()=>{throw Error('cache should prevent fetch');};const result=await searchTrains('北京','上海',date);assert.equal(result.options[0].service,'G123');}finally{global.fetch=previous;}});
test('rail tool is registered and rejects arbitrary URLs',async()=>{const {AIRLINE_TOOLS,executeAirlineTool}=await import('../src/lib/airline-tools-server.ts');assert.ok(AIRLINE_TOOLS.some(t=>t.function.name==='search_domestic_trains'));await assert.rejects(executeAirlineTool('search_domestic_trains',{origin:'北京',destination:'上海',date:'2026-11-01',url:'https://example.com'}));});
