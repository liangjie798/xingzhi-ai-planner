import test from "node:test";
import assert from "node:assert/strict";
import { routeMatrix, routeTransfers } from "../src/lib/tourism-routing-server.ts";

const place = (name, longitude, latitude) => ({ name, longitude, latitude, tag: "景点", blurb: "", category: "景点" });
const visit = (poi, date = "2026-11-14", day = 1) => ({ poi, day, date, time: "09:00", endTime: "10:00", visitMinutes: 60, queueMinutes: 0, restMinutes: 0, travelMinutes: 0, travelDistanceKm: 0, travelSource: "estimate", openingStatus: "", weatherAssessment: "" });
const originalFetch = globalThis.fetch;

async function withFetch(handler, run) {
  globalThis.fetch = handler;
  try { return await run(); } finally { globalThis.fetch = originalFetch; }
}

test("short hops use the AMap walking API and a 5 minute buffer", async () => {
  process.env.AMAP_WEB_SERVICE_KEY = "test-key";
  const a = place("甲景点", 120.15, 30.25);
  const b = place("乙景点", 120.152, 30.251);
  let requested = "";
  const result = await withFetch(async (url) => {
    requested = String(url);
    return new Response(JSON.stringify({ status: "1", route: { paths: [{ duration: "600", distance: "400" }] } }), { status: 200 });
  }, () => routeTransfers([visit(a), visit(b)]));
  assert.match(requested, /v3\/direction\/walking/);
  const leg = result[`${a.name}|${b.name}`];
  assert.equal(leg.source, "amap-walking");
  assert.equal(leg.distanceKm, 0.4);
  assert.equal(leg.minutes, 15);
});

test("longer hops keep driving ETA and the extra buffer", async () => {
  process.env.AMAP_WEB_SERVICE_KEY = "test-key";
  const a = place("丙景点", 120.15, 30.25);
  const b = place("丁景点", 121.2, 30.4);
  let requested = "";
  const result = await withFetch(async (url) => {
    requested = String(url);
    return new Response(JSON.stringify({ status: "1", route: { paths: [{ duration: "3600", distance: "80000" }] } }), { status: 200 });
  }, () => routeTransfers([visit(a), visit(b)]));
  assert.match(requested, /v3\/direction\/driving/);
  assert.match(requested, /strategy=0/);
  const leg = result[`${a.name}|${b.name}`];
  assert.equal(leg.source, "amap-driving");
  assert.equal(leg.minutes, 75);
});

test("provider failures stay out of the transfer table", async () => {
  process.env.AMAP_WEB_SERVICE_KEY = "test-key";
  const a = place("戊景点", 120.15, 30.25);
  const b = place("己景点", 120.153, 30.252);
  const result = await withFetch(async () => new Response(JSON.stringify({ status: "0" }), { status: 200 }), () => routeTransfers([visit(a), visit(b)]));
  assert.deepEqual(result, {});
});

test("without a service key no external request is made", async () => {
  delete process.env.AMAP_WEB_SERVICE_KEY;
  const a = place("庚景点", 120.15, 30.25);
  const b = place("辛景点", 120.152, 30.251);
  let calls = 0;
  const result = await withFetch(async () => { calls += 1; return new Response("{}"); }, () => routeTransfers([visit(a), visit(b)]));
  assert.equal(calls, 0);
  assert.deepEqual(result, {});
});
test("bicycling covers medium city hops", async () => {
  process.env.AMAP_WEB_SERVICE_KEY = "test-key";
  const a = place("壬景点", 120.15, 30.25);
  const b = place("癸景点", 120.166, 30.253);
  let requested = "";
  const result = await withFetch(async (url) => {
    requested = String(url);
    return new Response(JSON.stringify({ errcode: 0, data: { paths: [{ duration: "600", distance: "2000" }] } }), { status: 200 });
  }, () => routeTransfers([visit(a), visit(b)], "杭州市"));
  assert.match(requested, /v4\/direction\/bicycling/);
  const leg = result[`${a.name}|${b.name}`];
  assert.equal(leg.source, "amap-bicycling");
  assert.equal(leg.minutes, 20);
});

test("transit is used for longer same-city hops and falls back to driving", async () => {
  process.env.AMAP_WEB_SERVICE_KEY = "test-key";
  const a = place("子景点", 120.15, 30.25);
  const b = place("丑景点", 120.2, 30.29);
  const requests = [];
  const result = await withFetch(async (url) => {
    requests.push(String(url));
    return new Response(JSON.stringify({ status: "1", route: { transits: [{ duration: "1800", distance: "6000" }] } }), { status: 200 });
  }, () => routeTransfers([visit(a), visit(b)], "杭州市"));
  assert.match(requests[0], /v3\/direction\/transit\/integrated/);
  assert.match(requests[0], /city=%E6%9D%AD%E5%B7%9E/);
  const leg = result[`${a.name}|${b.name}`];
  assert.equal(leg.source, "amap-transit");
  assert.equal(leg.minutes, 45);

  const c = place("寅景点", 120.21, 30.3);
  const d = place("卯景点", 120.26, 30.34);
  const fallbackRequests = [];
  const fallback = await withFetch(async (url) => {
    fallbackRequests.push(String(url));
    if (String(url).includes("transit")) return new Response(JSON.stringify({ status: "0" }), { status: 200 });
    return new Response(JSON.stringify({ status: "1", route: { paths: [{ duration: "900", distance: "6000" }] } }), { status: 200 });
  }, () => routeTransfers([visit(c), visit(d)], "杭州市"));
  assert.equal(fallbackRequests.length, 2);
  assert.match(fallbackRequests[1], /v3\/direction\/driving/);
  const fallbackLeg = fallback[`${c.name}|${d.name}`];
  assert.equal(fallbackLeg.source, "amap-driving");
  assert.equal(fallbackLeg.minutes, 30);
});

test("distance matrix fills all candidate pairs and is capped at eight stops", async () => {
  process.env.AMAP_WEB_SERVICE_KEY = "test-key";
  const stops = [
    place("甲地", 120.15, 30.25),
    place("乙地", 120.16, 30.26),
    place("丙地", 120.17, 30.27),
  ];
  let calls = 0;
  const matrix = await withFetch(async (url) => {
    calls += 1;
    const destination = new URL(String(url)).searchParams.get("destination");
    const count = stops.filter((item) => `${item.longitude},${item.latitude}` !== destination).length;
    return new Response(JSON.stringify({ status: "1", results: Array.from({ length: count }, (_, index) => ({ origin_id: String(index + 1), distance: "3000", duration: "600" })) }), { status: 200 });
  }, () => routeMatrix(stops));
  assert.equal(calls, 3);
  assert.equal(Object.keys(matrix).length, 6);
  assert.equal(matrix["甲地|乙地"].source, "amap-matrix");
  assert.equal(matrix["甲地|乙地"].minutes, 20);

  let uncalled = true;
  const capped = await withFetch(async () => { uncalled = false; return new Response("{}"); }, () => routeMatrix(Array.from({ length: 9 }, (_, index) => place(`地点${index}`, 120 + index / 100, 30))));
  assert.deepEqual(capped, {});
  assert.equal(uncalled, true);
});
test("gentle trips skip bicycling for medium hops", async () => {
  process.env.AMAP_WEB_SERVICE_KEY = "test-key";
  const a = place("辰景点", 120.15, 30.25);
  const b = place("巳景点", 120.166, 30.253);
  let requested = "";
  const result = await withFetch(async (url) => {
    requested = String(url);
    return new Response(JSON.stringify({ status: "1", route: { transits: [{ duration: "1200", distance: "2000" }] } }), { status: 200 });
  }, () => routeTransfers([visit(a), visit(b)], "杭州市", { gentle: true }));
  assert.match(requested, /transit\/integrated/);
  assert.equal(result[`${a.name}|${b.name}`].source, "amap-transit");
});
