import test from "node:test";
import assert from "node:assert/strict";
import { activityAgenda, activityDates } from "../src/lib/activity-agenda.ts";
const input = { date: "2026-10-24", endDate: "2026-10-25", activityType: "校园运动会", duration: 2, participants: 300, group: "儿童青少年", intensity: "中强度" };
const result = { bestSlot: { hour: 14 }, slots: [{ date: "2026-10-24", hour: 14, score: 90 }, { date: "2026-10-25", hour: 9, score: 88 }], actions: ["分组组织并控制负荷"] };
test("agenda covers preparation, entire session, breaks and exit without gaps", () => {
  const agenda = activityAgenda(input, result, input.date);
  assert.equal(agenda[0].time, "13:00–13:30");
  assert.equal(agenda.at(-1).time, "16:00–16:15");
  for (let i = 1; i < agenda.length; i++) assert.equal(agenda[i].time.split("–")[0], agenda[i - 1].time.split("–")[1]);
  assert.ok(agenda.some((item) => item.title.includes("补水")));
  assert.ok(agenda.every((item) => item.action && item.owner));
});
test("each date uses its own best hourly score", () => {
  assert.deepEqual(activityDates(input), ["2026-10-24", "2026-10-25"]);
  assert.equal(activityAgenda({ ...input, startHour: 9 }, result, "2026-10-25")[0].time, "08:00–08:30");
});
test("an afternoon session does not move into the evening for a higher score", () => {
  const data = { ...result, slots: [{ date: input.date, hour: 19, score: 99 }, { date: input.date, hour: 14, score: 80 }] };
  assert.equal(activityAgenda({ ...input, startHour: 14 }, data, input.date)[2].time.split("–")[0], "14:00");
});
test("five activity scenes have different core tasks", () => {
  const titles = ["校园运动会", "体育课", "社区活动", "户外训练", "研学活动"].map((activityType) => activityAgenda({ ...input, activityType }, result, input.date).map((item) => item.title).join(" "));
  assert.equal(new Set(titles).size, 5);
});
test("a long session still has continuous timestamps", () => {
  const agenda = activityAgenda({ ...input, duration: 12 }, result, input.date);
  for (let i = 1; i < agenda.length; i++) assert.equal(agenda[i].time.split("–")[0], agenda[i - 1].time.split("–")[1]);
});
