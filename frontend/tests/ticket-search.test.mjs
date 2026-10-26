import test from "node:test";
import assert from "node:assert/strict";
import { decodeRpc,providerObjects } from "../src/lib/variflight-mcp-server.ts";
import { cityCode,flightOptions,trainOptions,trainCandidates,flightSql,searchTickets,summarizeTickets } from "../src/lib/ticket-search-server.ts";
import { isTransportQuestion,journeyLocations } from "../src/lib/journey.ts";

test("cheap journey requests enter transport and preserve their direction",()=>{
  for(const phrase of ["西安到榆林怎么出发便宜","西安到榆林怎么走便宜","查询明天的机票","高铁和航班哪个便宜"])assert.equal(isTransportQuestion(phrase),true,phrase);
  assert.deepEqual(journeyLocations("西安到榆林怎么出发便宜"),{originCity:"西安",destination:"榆林"});
  assert.equal(isTransportQuestion("明天西安气温"),false);
});
test("MCP SSE and embedded table rows are parsed without treating prose as price",()=>{
  assert.equal(decodeRpc('event: message\ndata: {"jsonrpc":"2.0","method":"notice"}\n\nevent: message\ndata: {"id":1,"result":{"ok":true}}\n\n').result.ok,true);
  assert.ok(providerObjects({columns:[{name:"adult_total"},{name:"option_id"}],rows:[[360,"real-option"]]}).some(row=>row.adult_total===360));
  assert.equal(flightOptions("网页说机票100元").length,0);
  assert.equal(flightOptions({adult_total:null,option_id:"x"}).length,0);
  assert.equal(flightOptions({adult_total:0,option_id:"x"}).length,0);
  assert.equal(flightOptions({adult_total:350,option_id:"real"})[0].price,350);
});
test("airport ambiguity, SQL injection, unavailable seats and stale train dates fail closed",()=>{
  assert.equal(cityCode([{cityName:"西安",cityCode:"SIA"}],"西安市"),"SIA");
  assert.equal(cityCode([{cityName:"西安",cityCode:"SIA"},{cityName:"西安",cityCode:"XIY"}],"西安"),undefined);
  assert.throws(()=>flightSql("SIA';DROP","UYN","2026-10-27"));
  assert.equal(trainOptions({seatName:"硬座",price:80,remaining:0},"K1").length,0);
  assert.equal(trainOptions({seatName:"硬座",price:80},"K1").length,0);
  assert.equal(trainOptions({seatName:"硬座",price:80,remaining:"候补"},"K1").length,0);
  assert.equal(trainOptions({seatName:"硬座",price:"80.50",remaining:"有"},"K1")[0].price,80.5);
  assert.equal(trainCandidates({trainNumber:"K1",depDate:"2026-10-26",depStationCode:"XAY",arrStationCode:"ALY"},"2026-10-27").length,0);
  assert.match(summarizeTickets([{mode:"火车",price:80,service:"K1",seat:"硬座"}],[]),/尚不能判断/);
});

test("missing authorization never fetches or reuses manually entered prices",async()=>{
  const key=process.env.VARIFLIGHT_MCP_KEY,fetcher=global.fetch;
  delete process.env.VARIFLIGHT_MCP_KEY;
  global.fetch=async()=>{throw new Error("must not fetch");};
  try{const result=await searchTickets("西安","榆林","2099-01-01");assert.equal(result.status,"not-configured");assert.deepEqual(result.options,[]);assert.match(result.reply,/尚未启用/);}
  finally{global.fetch=fetcher;if(key===undefined)delete process.env.VARIFLIGHT_MCP_KEY;else process.env.VARIFLIGHT_MCP_KEY=key;}
});

test("authorized pipeline uses only read-only MCP tools and preserves quotes in both modes",async()=>{
  // Contract fixtures are not claims about a live provider response; real-key acceptance is separate.
  const key=process.env.VARIFLIGHT_MCP_KEY,fetcher=global.fetch,calls=[];
  process.env.VARIFLIGHT_MCP_KEY="test-only-not-a-real-key";
  global.fetch=async(url,options)=>{
    assert.equal(String(url),"https://c-gw.variflight.com/chat_message/mcp/api");
    const body=JSON.parse(options.body);calls.push(body);
    if(body.method==="notifications/initialized")return new Response(null,{status:202});
    let result={protocolVersion:"2025-03-26"};
    if(body.method==="tools/call"){
      const {name,arguments:args}=body.params;
      assert.ok(["searchAirport","getRouteFlightTickets","domesticDirectTrainSearch","trainDetail"].includes(name));
      if(name==="searchAirport")result={structuredContent:{cityName:args.name,cityCode:args.name==="西安"?"SIA":"UYN"}};
      if(name==="getRouteFlightTickets")result={content:[{type:"resource",resource:{mimeType:"application/json",text:JSON.stringify({columns:["option_id","adult_total"],rows:[["flight-option",350]]})}}]};
      if(name==="domesticDirectTrainSearch")result={structuredContent:{trains:[{trainNumber:"K1",depDate:args.depDate,depStationCode:"XAY",arrStationCode:"ALY"}]}};
      if(name==="trainDetail")result={structuredContent:{seats:[{seatName:"硬座",price:80,remaining:6},{seatName:"无座",price:60,remaining:0}]}};
    }
    return Response.json({jsonrpc:"2.0",id:body.id,result},{headers:{"Mcp-Session-Id":"test-session"}});
  };
  try{
    const result=await searchTickets("西安","榆林","2099-01-01");
    assert.equal(result.status,"available");assert.equal(result.options.length,2);assert.equal(result.options[0].price,80);assert.match(result.reply,/火车 K1/);assert.match(result.reply,/350/);
    assert.equal(calls.filter(row=>row.params?.name==="trainDetail").length,1);
  }finally{global.fetch=fetcher;if(key===undefined)delete process.env.VARIFLIGHT_MCP_KEY;else process.env.VARIFLIGHT_MCP_KEY=key;}
});
