import test from "node:test";
import assert from "node:assert/strict";
import { poiFromAmap, searchAmapPois, aroundAmapFoods } from "../src/lib/amap-places.ts";

test("AMap POI fields survive conversion and insecure image URLs are upgraded", () => {
  const spot = poiFromAmap({
    id: "B123", name: "杭州博物馆", type: "科教文化服务;博物馆;综合博物馆", location: "120.15,30.25",
    address: "粮道山18号", photos: [{ url: "http://store.is.autonavi.com/a.jpg" }],
    business: { opentime_today: "09:00-17:00", business_area: "吴山" },
  }, "景点", "博物馆", "杭州市");
  assert.equal(spot.poiId, "B123");
  assert.equal(spot.category, "景点");
  assert.equal(spot.origin, "amap");
  assert.equal(spot.poiType, "科教文化服务;博物馆;综合博物馆");
  assert.equal(spot.businessArea, "吴山");
  assert.equal(spot.openingHours, "09:00-17:00");
  assert.equal(spot.imageUrl, "https://store.is.autonavi.com/a.jpg");
  assert.equal(spot.name, "杭州博物馆");
  assert.equal(poiFromAmap({ name: "无坐标地点", location: "" }, "景点", "景点", "杭州市"), null);
});

test("keyword search deduplicates repeated POI names", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ status: "1", pois: [
    { name: "西湖", type: "风景名胜;公园广场;公园", location: "120.15,30.25" },
    { name: "西湖", type: "风景名胜;公园广场;公园", location: "120.15,30.25" },
  ] }), { status: 200 });
  try {
    const spots = await searchAmapPois("key", "杭州市", [{ keyword: "公园", category: "景点" }]);
    assert.equal(spots.length, 1);
    assert.equal(spots[0].tag, "公园");
  } finally { globalThis.fetch = originalFetch; }
});

test("around search is capped at three anchors and stays in the city", async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ status: "1", pois: [{ name: "近处小馆", type: "餐饮服务;中餐厅;浙江菜", location: "120.151,30.251" }] }), { status: 200 });
  };
  try {
    const foods = await aroundAmapFoods("key", "杭州市", [0, 1, 2, 3].map((index) => ({ longitude: 120.15 + index / 1000, latitude: 30.25 })));
    assert.equal(urls.length, 3);
    assert.ok(urls.every((url) => url.includes("/v5/place/around") && url.includes("radius=2000") && url.includes("city_limit=true")));
    assert.equal(foods.length, 1);
    assert.equal(foods[0].category, "美食");
  } finally { globalThis.fetch = originalFetch; }
});
