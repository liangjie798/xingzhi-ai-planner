import test from "node:test";
import assert from "node:assert/strict";
import { addDays, completeIntake, extractIntake } from "../src/lib/conversation-intake.ts";
import { recoverRejectedIntake, retainValidConversationInput } from "../src/lib/conversation-validation.ts";

const today = "2026-10-28";

test("invalid participant count preserves the other facts and correction changes only the count", () => {
  const rejected = retainValidConversationInput("明天出发，西安，玩三天，1.5个人", today, {});
  assert.equal(rejected.known.cityName, "西安市");
  assert.equal(rejected.known.date, addDays(today, 1));
  assert.equal(rejected.known.tripDays, 3);
  assert.equal(rejected.known.activityType, "旅游规划");
  assert.equal(rejected.known.participants, undefined);
  const corrected = completeIntake(rejected.known, extractIntake("10人", today, rejected.known), today);
  assert.equal(corrected.intake.known.participants, 10);
  for (const key of ["cityName", "date", "tripDays", "endDate", "activityType"]) assert.equal(corrected.intake.known[key], rejected.known[key]);
  assert.deepEqual(corrected.missing, ["同行或参与者是成年人、学生、老人，还是其他人群"]);
});

test("the screenshot's ten-day request is remembered but never analyzed beyond forecast coverage", () => {
  const rejected = retainValidConversationInput("明天出发，西安，玩十天，1.5个人", today, {});
  assert.equal(rejected.known.tripDays, 10);
  const corrected = completeIntake(rejected.known, extractIntake("10人", today, rejected.known), today);
  assert.equal(corrected.command, "clarify");
  assert.equal(corrected.intake.known.participants, 10);
  assert.match(corrected.reply, /西安市.*2026-10-29.*10天.*10人/);
  assert.match(corrected.reply, /请只调整出发或结束日期.*缩短行程天数/);
  assert.ok(!corrected.missing.some(item => /哪天|几天/.test(item)));
  const shortened = completeIntake(corrected.intake.known, extractIntake("改成三天，大学生", today, corrected.intake.known), today);
  assert.equal(shortened.command, "analyze");
  assert.equal(shortened.intake.known.endDate, "2026-10-31");
  assert.equal(shortened.intake.known.participants, 10);
  assert.equal(shortened.intake.known.cityName, "西安市");
});

test("multiple invalid fields are omitted while valid new details and prior choices survive", () => {
  const previous = { activityType: "体育课", cityName: "杭州市", participants: 30, duration: 2, equipmentCount: 5, intensity: "中强度", group: "普通人群" };
  const retained = retainValidConversationInput("明天在西安，大学生，-5人，-2小时，器材0套", today, previous);
  assert.equal(retained.issues.length, 3);
  assert.equal(retained.known.cityName, "西安市");
  assert.equal(retained.known.date, "2026-10-29");
  assert.equal(retained.known.audienceDescription, "大学生");
  assert.equal(retained.known.participants, 30);
  assert.equal(retained.known.duration, 2);
  assert.equal(retained.known.equipmentCount, 5);
  assert.equal(retained.known.intensity, "中强度");
  assert.deepEqual(previous, { activityType: "体育课", cityName: "杭州市", participants: 30, duration: 2, equipmentCount: 5, intensity: "中强度", group: "普通人群" });
});

test("an invalid calendar date does not discard city, trip length or valid people", () => {
  const retained = retainValidConversationInput("西安旅游三天，2月30日出发，10个大学生", today, { date: "2026-10-29" });
  assert.equal(retained.known.date, "2026-10-29");
  assert.equal(retained.known.cityName, "西安市");
  assert.equal(retained.known.participants, 10);
  assert.equal(retained.known.tripDays, 3);
});

test("existing rejected conversations can recover lost facts without overriding later changes", () => {
  const history = [
    { role: "user", content: "明天出发，西安，玩十天，1.5个人" },
    { role: "assistant", content: "人数必须为1至9999的整数。本次未重新计算。" },
    { role: "user", content: "10人" },
  ];
  const recovered = recoverRejectedIntake(history, today, { participants: 10 });
  assert.equal(recovered.cityName, "西安市");
  assert.equal(recovered.date, "2026-10-29");
  assert.equal(recovered.tripDays, 10);
  assert.equal(recovered.participants, 10);
  const revised = recoverRejectedIntake(history, today, { cityName: "杭州市", date: "2026-10-30", tripDays: 2, participants: 6 });
  assert.equal(revised.cityName, "杭州市");
  assert.equal(revised.tripDays, 2);
  assert.equal(revised.endDate, "2026-10-31");
  assert.equal(revised.participants, 6);
  assert.deepEqual(recoverRejectedIntake([], today, {}), {});
});
