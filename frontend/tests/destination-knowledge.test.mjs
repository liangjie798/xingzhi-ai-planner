import test from "node:test";
import assert from "node:assert/strict";
import { candidateCityTopic, cityInDestinationQuestion, regionalCitySources } from "../src/lib/city-introduction.ts";
import { cleanDestinationContext, destinationPreferences, rankDestinationPlaces, isDestinationFollowup, destinationRecommendationRequest } from "../src/lib/destination-knowledge.ts";

const places = [
  { name: "城市科技馆", tag: "科教文化服务;科技馆" },
  { name: "历史博物馆", tag: "博物馆" },
  { name: "湖畔公园", tag: "公园" },
  { name: "高山山顶徒步", tag: "登山" },
  { name: "夜店酒吧", tag: "休闲" },
  { name: "随机办公楼", tag: "商务" },
];

test("unknown city topics use validation candidates instead of a nine-city whitelist", () => {
  for (const city of ["绍兴", "安顺", "张家界", "邵阳市"]) assert.equal(candidateCityTopic(city), city);
  assert.equal(candidateCityTopic("介绍一下绍兴"), "绍兴");
  assert.equal(candidateCityTopic("数据来源"), undefined);
  for (const followup of ["换一批", "下雨呢", "五岁", "带爸妈", "少走路", "好的"]) assert.equal(candidateCityTopic(followup), undefined, followup);
  assert.equal(cityInDestinationQuestion("在绍兴带老人去哪里"), "绍兴");
  assert.equal(cityInDestinationQuestion("张家界带老人去哪里"), "张家界");
  assert.equal(cityInDestinationQuestion("绍兴有哪些适合亲子的地方"), "绍兴");
  assert.equal(cityInDestinationQuestion("从北京改去杭州，带孩子"), "杭州");
  assert.equal(cityInDestinationQuestion("带五岁孩子推荐去哪儿"), undefined);
  assert.equal(cityInDestinationQuestion("换成老人，少走路"), undefined);
});

test("domestic city evidence rejects foreign cities with the same name", () => {
  const rows = [
    { title: "安顺市简介", excerpt: "安顺市位于马来西亚霹雳州，Teluk Intan。" },
    { title: "安顺市概况", excerpt: "安顺市位于贵州省中西部。" },
    { title: "杭州概况", excerpt: "杭州市位于浙江省。" },
  ];
  assert.deepEqual(regionalCitySources(rows, "安顺市", "贵州省").map((item) => item.excerpt), ["安顺市位于贵州省中西部。"]);
});

test("preferences carry through questions but an audience correction clears the old child age", () => {
  const family = destinationPreferences("带五岁孩子，预算不多", { city: "绍兴市", topic: "introduction" });
  assert.equal(family.childAge, 5);
  assert.deepEqual(family.audiences, ["family"]);
  const rain = destinationPreferences("如果下雨呢", family);
  assert.equal(rain.city, "绍兴市");
  assert.equal(rain.indoor, true);
  assert.equal(rain.lowBudget, true);
  const senior = destinationPreferences("换成老人，少走路", rain);
  assert.deepEqual(senior.audiences, ["senior"]);
  assert.equal(senior.childAge, undefined);
  assert.equal(senior.lowWalking, true);
  assert.equal(senior.indoor, true);
  assert.deepEqual(destinationPreferences("不带孩子，只成年人", family).audiences, ["adult"]);
  assert.equal(destinationPreferences("那十一岁呢", family).childAge, 11);
});

test("audience, mobility and rain filters actually change named recommendations", () => {
  const family = rankDestinationPlaces(places, { audiences: ["family"] });
  assert.ok(family.some((place) => place.name === "城市科技馆"));
  assert.ok(!family.some((place) => /夜店|山顶|办公楼/.test(place.name)));
  const indoor = rankDestinationPlaces(places, { audiences: ["family"], indoor: true });
  assert.ok(indoor.length > 0);
  assert.ok(!indoor.some((place) => place.name === "湖畔公园"));
  const senior = rankDestinationPlaces(places, { audiences: ["senior"], lowWalking: true });
  assert.ok(senior.some((place) => place.name === "湖畔公园"));
  assert.ok(!senior.some((place) => /山顶|夜店|办公楼/.test(place.name)));
  assert.deepEqual(rankDestinationPlaces([{ name: "未知办公室", tag: "商务" }], { audiences: ["accessible"] }), []);
  assert.deepEqual(rankDestinationPlaces([{ name: "黄酒博物馆", tag: "博物馆" }], { audiences: ["family"], childAge: 5 }), []);
  const young = rankDestinationPlaces([{ name: "古代博物馆", tag: "博物馆" }, { name: "城市科技馆", tag: "科技馆" }], { audiences: ["family"], childAge: 5 });
  assert.equal(young[0].name, "城市科技馆");
});

test("knowledge followups are separate from weather, source and planning requests", () => {
  const context = { city: "杭州市", topic: "recommendation", audiences: ["family"] };
  for (const question of ["老人呢", "雨天呢", "孩子五岁", "少走路", "具体说说", "换一批", "美食呢"]) assert.equal(isDestinationFollowup(question, context), true, question);
  for (const question of ["数据来源", "这些推荐哪里来的", "明天气温多少", "明天会下雨吗", "帮我规划三天路线"]) assert.equal(isDestinationFollowup(question, context), false, question);
  assert.equal(destinationRecommendationRequest("不同人群推荐去哪些地方"), true);
  assert.equal(destinationRecommendationRequest("给老年人推荐去哪些城市"), true);
});

test("malformed context cannot create nonexistent audience policies", () => {
  const context = cleanDestinationContext({ audiences: ["__proto__", "unknown", "senior", "senior"], childAge: 80, indoor: "yes", lastPlaces: [1, "真实场馆"] });
  assert.deepEqual(context.audiences, ["senior"]);
  assert.equal(context.childAge, undefined);
  assert.equal(context.indoor, undefined);
  assert.deepEqual(context.lastPlaces, ["真实场馆"]);
});
