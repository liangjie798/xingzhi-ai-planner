import test from "node:test";
import assert from "node:assert/strict";
import { extractIntake, completeIntake } from "../src/lib/conversation-intake.ts";

const today = "2026-10-23";
function turn(known, message) { return completeIntake(known, extractIntake(message, today, known), today); }

test("three-day request asks for destination and departure instead of using dashboard defaults", () => {
  const result = turn({}, "帮我规划三天旅游路线");
  assert.equal(result.command, "clarify");
  assert.equal(result.intake.known.tripDays, 3);
  assert.equal(result.intake.known.cityName, undefined);
  assert.equal(result.intake.known.date, undefined);
  assert.match(result.reply, /哪个城市/);
  assert.match(result.reply, /哪天出发/);
});
test("three turns preserve answers and compute all three travel dates", () => {
  const first = turn({}, "帮我规划三天旅游路线");
  const second = turn(first.intake.known, "西安，明天出发");
  assert.equal(second.command, "clarify");
  assert.doesNotMatch(second.reply, /哪个城市|哪天出发/);
  const third = turn(second.intake.known, "2人，都是成年人");
  assert.equal(third.command, "analyze");
  assert.equal(third.patch.cityName, "西安市");
  assert.equal(third.patch.date, "2026-10-24");
  assert.equal(third.patch.endDate, "2026-10-26");
  assert.equal(third.patch.participants, 2);
  assert.equal(third.patch.group, "普通人群");
  const fourth = turn(third.intake.known, "改为后天出发");
  assert.equal(fourth.patch.endDate, "2026-10-27");
});
test("sports request asks for participants and load before analyzing", () => {
  const first = turn({}, "分析西安明天下午哪个时段适合举办两小时运动会");
  assert.equal(first.command, "clarify");
  assert.equal(first.patch.duration, 2);
  assert.equal(first.patch.startHour, 14);
  const second = turn(first.intake.known, "300人，初中生，中强度");
  assert.equal(second.command, "analyze");
  assert.equal(second.patch.group, "儿童青少年");
});
test("explicit delegation supplies disclosed defaults but never invents destination or dates", () => {
  const first = turn({}, "帮我规划三天旅游路线，按常规推荐");
  assert.equal(first.command, "clarify");
  assert.equal(first.intake.known.cityName, undefined);
  const second = turn(first.intake.known, "杭州，明天出发");
  assert.equal(second.command, "analyze");
  assert.match(second.reply, /1人（普通人群）/);
});
test("audience answer is not interpreted as a city", () => {
  const result = turn({}, "成年人");
  assert.equal(result.intake.known.cityName, undefined);
  assert.equal(result.intake.known.group, "普通人群");
});
test("an unknown bare destination is preserved for district search", () => {
  assert.equal(turn({}, "天水").intake.known.cityName, "天水");
  assert.equal(turn({}, "帮我规划天水三天旅游路线").intake.known.cityName, "天水");
});
test("invalid and out-of-forecast dates require correction", () => {
  assert.equal(turn({}, "2026年2月30日").intake.known.date, undefined);
  const result = turn({ cityName: "杭州市", activityType: "旅游规划", tripDays: 3, participants: 2, group: "普通人群" }, "10月29日出发");
  assert.equal(result.command, "clarify");
  assert.match(result.reply, /调整出发或结束日期/);
});

test("university students are classified as adults", () => { assert.equal(turn({}, "大学生").intake.known.group, "普通人群"); });
