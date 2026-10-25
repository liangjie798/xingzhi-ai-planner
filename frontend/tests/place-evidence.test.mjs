import test from "node:test";
import assert from "node:assert/strict";
import { officialPlaceEvidence, matchedSearchEvidence, mergePlaceEvidence } from "../src/lib/place-evidence.ts";

test("official evidence relates actual stops, respects cities and merges directory references",()=>{
  const evidence=officialPlaceEvidence("西安市",["秦始皇兵马俑博物馆","大雁塔","西安博物院","不存在的地点"]);
  assert.equal(evidence.length,2);
  assert.deepEqual(evidence[1].relatedPlaces,["大雁塔","西安博物院"]);
  assert.ok(!JSON.stringify(evidence).includes("不存在的地点"));
  assert.equal(officialPlaceEvidence("杭州市",["西安城墙"]).length,0);
  assert.ok(officialPlaceEvidence("北京市",["颐和园"]).length>=2);
});
test("place searches reject irrelevant cities, advertising and unknown place matches",()=>{
  const row={title:"西安博物院参观指南",excerpt:"西安博物院历史文化",url:"https://example.com/guide",retrievedAt:"2026-10-25T12:00:00Z"};
  assert.equal(matchedSearchEvidence("西安市",["西安博物院"],[row]).length,1);
  assert.equal(matchedSearchEvidence("杭州市",["西安博物院"],[row]).length,0);
  assert.equal(matchedSearchEvidence("西安市",["西安城墙"],[row]).length,0);
  assert.equal(matchedSearchEvidence("西安市",["西安博物院"],[{...row,title:"西安博物院旅行社TOP3"}]).length,0);
  assert.match(matchedSearchEvidence("西安市",["西安博物院"],[row])[0].verification,/尚未核验全文/);
});
test("source dedup retains related places without changing existing saved evidence",()=>{
  const a={title:"名录",sourceUrl:"https://example.com/directory",relatedPlaces:["大雁塔"]};
  const output=mergePlaceEvidence([a,{...a,relatedPlaces:["西安博物院"]}]);
  assert.equal(output.length,1);assert.deepEqual(output[0].relatedPlaces,["大雁塔","西安博物院"]);
  assert.deepEqual(a.relatedPlaces,["大雁塔"]);
});
