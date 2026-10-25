import test from "node:test";
import assert from "node:assert/strict";
import { cityIntroductionSubject, cityProfiles, cityIntroductionQuery, selectCityIntroductionSources } from "../src/lib/city-introduction.ts";
import { classifyConversation, isWeatherFollowup } from "../src/lib/conversation-knowledge.ts";

test("a city name is an introduction outside intake, but remains a destination answer during intake", () => {
  for (const message of ["西安", "西安市", "请介绍一下西安", "西安简介", "西安城市概况", "简单介绍一下西安"]) {
    assert.equal(cityIntroductionSubject(message), "西安", message);
  }
  assert.equal(classifyConversation("西安"), "knowledge");
  assert.equal(classifyConversation("西安", true), "planning");
  assert.equal(classifyConversation("介绍一下西安", true), "knowledge");
  assert.equal(isWeatherFollowup("西安", "西安市 · 2026-10-26 天气预报（北京时间）"), false);
  assert.equal(isWeatherFollowup("那西安呢", "杭州市 · 2026-10-26 天气预报（北京时间）"), true);
});

test("weather, food-specific and unrelated questions keep their original meaning", () => {
  for (const message of ["西安明天天气", "西安美食推荐", "数据来源", "量子力学", "帮我规划西安三天行程"]) {
    assert.equal(cityIntroductionSubject(message), undefined, message);
  }
  assert.equal(cityIntroductionSubject("杭州市"), "杭州");
  assert.equal(cityIntroductionSubject("介绍一下绍兴市"), "绍兴市");
});

test("city retrieval excludes incidental news and sources from other cities", () => {
  const rows = [
    { title: "遇见农高会：西安都市农业", excerpt: "农高会科技和品牌活动", url: "https://example.com/news" },
    { title: "西安市情简介", excerpt: "西安古称长安", url: "https://www.xa.gov.cn/profile" },
    { title: "杭州旅游景点", excerpt: "杭州位于浙江省", url: "https://example.com/hangzhou" },
  ];
  assert.deepEqual(selectCityIntroductionSources(rows, "西安市").map((item) => item.title), ["西安市情简介"]);
  assert.match(cityIntroductionQuery("杭州"), /城市简介.*历史文化.*特色美食/);
  assert.ok(cityProfiles["西安"].sources.every((source) => source.url.startsWith("https://")));
});
