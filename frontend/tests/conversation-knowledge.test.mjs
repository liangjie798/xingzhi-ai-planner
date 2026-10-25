import test from "node:test";
import assert from "node:assert/strict";
import { classifyConversation, retrieveKnowledge } from "../src/lib/conversation-knowledge.ts";
import { summarizeWeather, weatherPlace, weatherDestination } from "../src/lib/conversation-weather.ts";
import { searchKnowledge } from "../src/lib/social-research.ts";

test("weather queries bypass planning intake even when a plan is pending", () => {
  for (const pending of [true, false]) {
    assert.equal(classifyConversation("告诉我明天西安的天气", pending), "weather");
    assert.equal(classifyConversation("明天下午会下雨吗？", pending), "weather");
    assert.equal(classifyConversation("帮我规划三天旅游路线", pending), "planning");
  }
  assert.equal(classifyConversation("七个大学生", true), "planning");
  assert.equal(classifyConversation("你好", true), "knowledge");
});

test("knowledge questions do not become activity constraints", () => {
  for (const message of ["US AQI和PM2.5有什么区别", "降水概率是什么意思", "运动会需要准备什么", "西安有什么美食推荐？", "量子力学是什么？"]) {
    assert.equal(classifyConversation(message, true), "knowledge", message);
  }
  assert.equal(retrieveKnowledge("量子力学是什么").length, 0);
  assert.ok(retrieveKnowledge("门票预约怎么查").some((e) => e.id === "trip"));
});

test("weather summaries use actual observations and never fabricate absent periods", () => {
  assert.equal(weatherPlace("告诉我明天太原的天气"), "太原");
  assert.equal(weatherPlace("青岛明天气温多少？"), "青岛");
  assert.equal(weatherPlace("明天下午会下雨吗？"), undefined);
  assert.equal(weatherDestination("告诉我明天西安的天气", "西安市", "杭州市"), "西安市");
  assert.equal(weatherDestination("成都武侯区明天天气", "成都市", "杭州市"), "成都武侯区");
  assert.equal(weatherDestination("明天太原的天气", undefined, "杭州市"), "太原");
  const summary = summarizeWeather("西安市", "2026-10-26", [
    { hour: 9, temperature: 15.2, rainProbability: 20 },
    { hour: 14, temperature: 23.1, rainProbability: 40 },
    { hour: 20, temperature: null, rainProbability: 0 },
  ]);
  assert.match(summary, /15.2–23.1℃/);
  assert.match(summary, /40%/);
  assert.doesNotMatch(summary, /晚上：/);
  assert.throws(() => summarizeWeather("西安市", "2026-10-26", []), /no-weather/);
});

test("general search sends the actual question and keeps safe attributed sources", async () => {
  const saved = { key: process.env.BAIDU_SEARCH_API_KEY, provider: process.env.WEB_SEARCH_PROVIDER, fetch: globalThis.fetch };
  process.env.BAIDU_SEARCH_API_KEY = "fixture-key";
  process.env.WEB_SEARCH_PROVIDER = "baidu";
  globalThis.fetch = async (_url, init) => {
    assert.equal(JSON.parse(init.body).messages[0].content, "为什么会有彩虹？");
    return Response.json({ references: [{ title: "彩虹的形成", content: "光学现象", url: "https://www.cma.gov.cn/science" }, { title: "unsafe", url: "http://127.0.0.1/secret" }] });
  };
  try {
    const items = await searchKnowledge("为什么会有彩虹？");
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "彩虹的形成");
    assert.ok(!JSON.stringify(items).includes("fixture-key"));
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [name, value] of [["BAIDU_SEARCH_API_KEY", saved.key], ["WEB_SEARCH_PROVIDER", saved.provider]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
