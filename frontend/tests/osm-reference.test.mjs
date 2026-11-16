import test from "node:test";
import assert from "node:assert/strict";
import { fetchOsmParks, parseOverpassParks, wgs84ToGcj02 } from "../src/lib/osm-reference-server.ts";

test("WGS-84 coordinates are shifted into GCJ-02", () => {
  const [longitude, latitude] = wgs84ToGcj02(116.404, 39.915);
  assert.ok(Math.abs(longitude - 116.410244) < 0.001);
  assert.ok(Math.abs(latitude - 39.916401) < 0.001);
});

test("only Chinese named parks survive parsing and deduplication", () => {
  const places = parseOverpassParks({ elements: [
    { type: "node", lat: 30.25, lon: 120.15, tags: { name: "西湖公园", leisure: "park" } },
    { type: "node", lat: 30.2501, lon: 120.1501, tags: { name: "西湖公园", leisure: "park" } },
    { type: "node", lat: 30.26, lon: 120.16, tags: { name: "West Lake", leisure: "park" } },
    { type: "way", center: { lat: 30.27, lon: 120.17 }, tags: { name: "柳浪闻莺", leisure: "garden" } },
  ] });
  assert.equal(places.length, 2);
  assert.equal(places[0].name, "西湖公园");
  assert.equal(places[0].origin, "osm");
  assert.equal(places[1].name, "柳浪闻莺");
  assert.notEqual(places[0].longitude, 120.15);
});

test("Overpass stays disabled until an endpoint is configured", async () => {
  delete process.env.OSM_OVERPASS_URL;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response("{}"); };
  try {
    assert.deepEqual(await fetchOsmParks({ longitude: 120.15, latitude: 30.25 }), []);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("configured endpoint posts an Overpass query and converts coordinates", async () => {
  process.env.OSM_OVERPASS_URL = "https://overpass.example/api/interpreter";
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({ elements: [{ type: "node", lat: 30.25, lon: 120.15, tags: { name: "湖边公园", leisure: "park" } }] }), { status: 200 });
  };
  try {
    const places = await fetchOsmParks({ longitude: 120.15, latitude: 30.25 });
    assert.match(request.url, /overpass\.example/);
    assert.equal(request.init.method, "POST");
    assert.match(String(request.init.body), /leisure/);
    assert.equal(places.length, 1);
    assert.equal(places[0].origin, "osm");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OSM_OVERPASS_URL;
  }
});
