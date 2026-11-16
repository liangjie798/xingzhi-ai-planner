import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { bd09ToGcj02, baiduSignedUrl, verifyBaiduPlace } from "../src/lib/baidu-map-server.ts";

const originalFetch = globalThis.fetch;

test("BD-09 coordinates are converted to GCJ-02", () => {
  const [longitude, latitude] = bd09ToGcj02(116.404, 39.915);
  assert.ok(Math.abs(longitude - 116.39763) < 0.002);
  assert.ok(Math.abs(latitude - 39.90866) < 0.002);
});

test("server-side requests include a deterministic SN when SK is configured", () => {
  const url = baiduSignedUrl({ query: "西湖", region: "杭州市", output: "json" }, "test-ak", "test-sk");
  const query = new URL(url).searchParams;
  assert.equal(query.get("ak"), "test-ak");
  assert.match(query.get("sn") || "", /^[a-f0-9]{32}$/);
  const base = [...query.entries()]
    .filter(([key]) => key !== "sn")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  assert.equal(query.get("sn"), createHash("md5").update(`${base}test-sk`).digest("hex"));
});

test("the nearest name-matching Baidu result is returned in GCJ-02", async () => {
  process.env.BAIDU_MAP_AK = "test-ak";
  delete process.env.BAIDU_MAP_SK;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ status: 0, results: [
      { name: "杭州博物馆", location: { lat: 30.251, lng: 120.156 }, address: "粮道山18号" },
      { name: "杭州博物馆南馆", location: { lat: 30.233, lng: 120.166 }, address: "南馆路" },
    ] }), { status: 200 });
  };
  try {
    const match = await verifyBaiduPlace({ name: "杭州博物馆", cityName: "杭州市", longitude: 120.15, latitude: 30.25 });
    assert.equal(match.name, "杭州博物馆");
    assert.equal(match.address, "粮道山18号");
    assert.ok(match.distanceMeters < 1000);
    assert.notEqual(match.longitude, 120.156);
    await verifyBaiduPlace({ name: "杭州博物馆", cityName: "杭州市", longitude: 120.15, latitude: 30.25 });
    assert.equal(calls, 1, "the same lookup is cached");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.BAIDU_MAP_AK;
  }
});

test("missing credentials or unmatched names do not fabricate a place", async () => {
  delete process.env.BAIDU_MAP_AK;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response("{}"); };
  try {
    assert.equal(await verifyBaiduPlace({ name: "任何地点", cityName: "无密钥测试市", longitude: 120.15, latitude: 30.25 }), null);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }

  process.env.BAIDU_MAP_AK = "test-ak";
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 0, results: [{ name: "另一个地点", location: { lat: 30.25, lng: 120.15 } }] }), { status: 200 });
  try {
    assert.equal(await verifyBaiduPlace({ name: "测试博物馆", cityName: "名称不匹配测试市", longitude: 120.15, latitude: 30.25 }), null);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.BAIDU_MAP_AK;
  }
});
