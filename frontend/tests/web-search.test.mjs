import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSearchResults, collectWebResearch } from "../src/lib/social-research.ts";

test("Baidu results retain original attribution and exclude unrelated or unsafe links", () => {
  const references = [
    { title: "西安城墙游览", content: "西安城墙预约说明", url: "https://www.xa.gov.cn/tour", type: "web", date: "2026-10-20" },
    { title: "杭州游览", content: "西湖游览", url: "https://www.hangzhou.gov.cn/tour", type: "web" },
    { title: "西安", url: "javascript:alert(1)" },
    { title: "西安", url: "https://127.0.0.1/secret" },
    { title: "西安", url: "https://user:password@example.com/a" },
    { title: "西安", url: "https://www.douyin.com/search/123" },
    { title: "西安", url: "https://example.com/image", type: "image" },
  ];
  const items = normalizeSearchResults({ references }, "西安市", "百度搜索");
  assert.equal(items.length, 1);
  assert.equal(items[0].provider, "百度搜索");
  assert.equal(items[0].platform, "www.xa.gov.cn");
  assert.equal(items[0].publishedAt, "2026-10-20");
});

test("site searches enforce source domain, clean markup and deduplicate", () => {
  const row = { title: "<b>西安攻略</b>", content: "西安城墙", url: "https://www.xiaohongshu.com/explore/abc123" };
  const items = normalizeSearchResults({ references: [row, row, { ...row, url: "https://xiaohongshu.com.attacker.test/explore/abc" }] }, "西安市", "百度搜索", "xiaohongshu.com");
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "西安攻略");
  assert.equal(items[0].platform, "小红书");
  assert.equal(normalizeSearchResults(null, "西安", "百度搜索").length, 0);
  assert.equal(normalizeSearchResults({ results: [row] }, "西安", "Tavily").length, 1);
});

test("missing credentials do not trigger network access or report success", async () => {
  const previous = { key: process.env.BAIDU_SEARCH_API_KEY, provider: process.env.WEB_SEARCH_PROVIDER };
  const original = globalThis.fetch;
  delete process.env.BAIDU_SEARCH_API_KEY;
  process.env.WEB_SEARCH_PROVIDER = "baidu";
  globalThis.fetch = async () => { throw new Error("network must not be used"); };
  try {
    const result = await collectWebResearch("西安市", "旅游");
    assert.equal(result.items.length, 0);
    assert.equal(result.sources[0].status, "unavailable");
    assert.match(result.sources[0].detail, /未配置/);
  } finally {
    globalThis.fetch = original;
    for (const [name, value] of [["BAIDU_SEARCH_API_KEY", previous.key], ["WEB_SEARCH_PROVIDER", previous.provider]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});

test("Baidu requests, caching and auth failures are handled without exposing credentials", async () => {
  const previous = { key: process.env.BAIDU_SEARCH_API_KEY, provider: process.env.WEB_SEARCH_PROVIDER };
  const original = globalThis.fetch;
  process.env.BAIDU_SEARCH_API_KEY = "test-secret-never-returned";
  process.env.WEB_SEARCH_PROVIDER = "baidu";
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    assert.equal(url, "https://qianfan.baidubce.com/v2/ai_search/web_search");
    assert.equal(init.headers.Authorization, "Bearer test-secret-never-returned");
    return Response.json({ references: [{ title: "南京旅游", content: "南京博物院", type: "web", url: "https://www.nanjing.gov.cn/tour" }] });
  };
  try {
    const first = await collectWebResearch("南京市", "旅游");
    await collectWebResearch("南京市", "旅游");
    assert.equal(calls.length, 3);
    assert.equal(calls[0].search_source, "baidu_search_v2");
    assert.deepEqual(calls[1].search_filter.match.site, ["xiaohongshu.com"]);
    assert.equal(first.items.length, 1);
    globalThis.fetch = async () => new Response("test-secret-never-returned", { status: 401 });
    const failed = await collectWebResearch("成都市", "旅游");
    assert.equal(failed.items.length, 0);
    assert.ok(failed.sources.every((s) => /密钥无效/.test(s.detail)));
    assert.ok(!JSON.stringify(failed).includes("test-secret"));
  } finally {
    globalThis.fetch = original;
    for (const [name, value] of [["BAIDU_SEARCH_API_KEY", previous.key], ["WEB_SEARCH_PROVIDER", previous.provider]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
