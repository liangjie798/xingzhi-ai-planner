import test from "node:test";
import assert from "node:assert/strict";
import { calendarDateFromText, extractIntake } from "../src/lib/conversation-intake.ts";
import { isWeatherFollowup, classifyConversation } from "../src/lib/conversation-knowledge.ts";
import { explainRain, forecastRangeReply } from "../src/lib/weather-explanation.ts";

test("month-day shorthand cannot become the first day of the current month or a trip length", () => {
  const known = { cityName: "榆阳区", activityType: "旅游规划", date: "2026-10-27", tripDays: 3 };
  for (const phrase of ["11-1日呢", "11/1呢", "11-1日气温呢", "11月1日呢", "2026-11-1呢"]) {
    assert.equal(calendarDateFromText(phrase, "2026-10-26").date, "2026-11-01", phrase);
    const delta = extractIntake(phrase, "2026-10-26", known);
    assert.equal(delta.date, "2026-11-01", phrase);
    assert.equal(delta.tripDays, undefined, phrase);
  }
  for (const phrase of ["11-1日呢", "11/1呢", "2026-11-1呢", "11月2日呢"]) {
    assert.equal(isWeatherFollowup(phrase, "天气预报（北京时间）"), true, phrase);
  }
  assert.ok(calendarDateFromText("11-31日气温", "2026-10-26").error);
  assert.equal(extractIntake("玩三天，11-1日出发", "2026-10-26", known).tripDays, 3);
  assert.equal(extractIntake("三日游", "2026-10-26", known).tripDays, 3);
  assert.equal(calendarDateFromText("28号气温", "2026-10-26").date, "2026-10-28");
});

test("rain explanations distinguish general mechanisms from unverified recent conditions", () => {
  const answer = explainRain("最近西安为什么这么多雨", "2026-10-26", "榆阳区");
  assert.equal(classifyConversation("最近西安为什么这么多雨", true), "knowledge");
  assert.match(answer.reply, /西安秋季/);
  assert.match(answer.reply, /尚未核实/);
  assert.ok(answer.reply.length < 400);
  assert.ok(answer.sources.every(source => source.url.startsWith("https://www.weather.com.cn/")));
  assert.doesNotMatch(explainRain("北京为什么一直下雨", "2026-10-26").reply, /北京秋季.*华西秋雨/);
  assert.doesNotMatch(explainRain("西安夏天为什么多雨", "2026-10-26").reply, /西安秋季/);
  assert.match(explainRain("最近苏州为什么这么多雨", "2026-10-26", "西安").reply, /^苏州的/);
  assert.equal(explainRain("明天西安下雨吗", "2026-10-26"), null);
});

test("repeated out-of-range queries stay truthful and become concise", () => {
  const first = forecastRangeReply("西安", "2026-11-02", "2026-10-26", "2026-11-01", "");
  const repeat = forecastRangeReply("西安", "2026-11-02", "2026-10-26", "2026-11-01", first);
  assert.match(repeat, /仍超出/);
  assert.ok(repeat.length < first.length);
  assert.match(repeat, /2026-11-02/);
  assert.doesNotMatch(repeat, /温度|℃/);
});
