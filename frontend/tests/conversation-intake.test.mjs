import test from "node:test";
import assert from "node:assert/strict";
import { extractIntake, completeIntake, relativeDateFromText, calendarDateFromText, isPlanRevision, intakeChoices } from "../src/lib/conversation-intake.ts";

const today = "2026-10-23";
test("calendar day and week queries replace old dates and validate the real calendar",()=>{
  const known={cityName:"西安市",date:"2026-10-27"};
  for(const phrase of ["28号气温","二十八号的气温","28日呢"])
    assert.equal(extractIntake(phrase,"2026-10-26",known).date,"2026-10-28",phrase);
  assert.equal(extractIntake("一周后的气温","2026-10-26",known).date,"2026-11-02");
  assert.equal(extractIntake("下月5号气温","2026-10-26",known).date,"2026-11-05");
  assert.equal(extractIntake("下个月5号气温","2026-12-26",known).date,"2027-01-05");
  assert.equal(extractIntake("明年二月二十八号气温","2026-10-26",known).date,"2027-02-28");
  assert.match(calendarDateFromText("2月30号气温","2026-10-26").error,/没有30号/);
  assert.match(calendarDateFromText("32号气温","2026-10-26").error,/没有32号/);
  assert.equal(calendarDateFromText("2月29号气温","2028-02-20").date,"2028-02-29");
});
test("reported study activity conversation accepts inverted intensity and delegation without repeating questions", () => {
  const day = "2026-10-25";
  let state = { cityName: "西安市" };
  for (const message of ["规划研学活动", "西安明天到30号", "100人，6小时", "学生", "强度高"]) {
    const result = completeIntake(state, extractIntake(message, day, state), day);
    state = result.intake.known;
  }
  assert.equal(state.intensity, "高强度"); assert.equal(state.duration, 6); assert.equal(state.participants, 100);
  assert.equal(state.date, "2026-10-26"); assert.equal(state.endDate, "2026-10-30");
  assert.deepEqual(intakeChoices(state).map(item => item.label), ["上午", "下午", "晚上", "不限时段，由系统推荐"]);
  const result = completeIntake(state, extractIntake("常规推荐", day, state), day);
  assert.equal(result.command, "analyze"); assert.equal(result.patch.intensity, "高强度"); assert.equal(result.patch.duration, 6);
  assert.equal(result.patch.endDate, "2026-10-30"); assert.deepEqual(result.choices, []);
  for (const message of ["高", "强度高", "高强度", "强度是高", "高？"]) assert.equal(extractIntake(message, day, state).intensity, "高强度", message);
});

test("choice answers advance the intake and preserve existing answers", () => {
  let state = { cityName: "西安市", date: "2026-10-26", activityType: "研学活动", participants: 100, duration: 6 };
  for (const answer of ["学生", "高强度", "不限时段，常规推荐"]) {
    assert.ok(intakeChoices(state).some(item => item.message === answer));
    state = completeIntake(state, extractIntake(answer, "2026-10-25", state), "2026-10-25").intake.known;
  }
  assert.equal(state.group, "儿童青少年"); assert.equal(state.intensity, "高强度"); assert.equal(state.allowedStartHour, 6); assert.equal(state.allowedEndHour, 21);
  assert.equal(state.duration, 6); assert.equal(state.participants, 100);
});
function turn(known, message) { return completeIntake(known, extractIntake(message, today, known), today); }

test("weather date continuations parse weeks and days relative to Beijing today", () => {
  for (const [phrase, date] of [["大后天呢?", "2026-10-26"], ["一周后呢？", "2026-10-30"], ["那两周后呢", "2026-11-06"], ["再过十天后呢", "2026-11-02"]]) assert.equal(relativeDateFromText(phrase, today), date, phrase);
});

test("numeric offsets followed by weather do not collide with 后天 or become trip lengths",()=>{
  for(const phrase of ["10天后天气","十天后天气","十天后的天气","十天以后天气","十天之后天气","再过十天天气"]){
    assert.equal(relativeDateFromText(phrase,"2026-10-26"),"2026-11-05",phrase);
  }
  for(const phrase of ["10天后天气","十天后的天气","十天以后天气"]) assert.equal(extractIntake(phrase,"2026-10-26",{}).tripDays,undefined,phrase);
  assert.equal(relativeDateFromText("两周后天气","2026-10-26"),"2026-11-09");
  assert.equal(relativeDateFromText("10天后天气","2026-12-26"),"2027-01-05");
  assert.equal(relativeDateFromText("十天后天气","2028-02-20"),"2028-03-01");
  assert.equal(relativeDateFromText("后天天气","2026-10-26"),"2026-10-28");
  const changed=extractIntake("改为十天后的三天旅游","2026-10-26",{cityName:"西安市"});
  assert.equal(changed.date,"2026-11-05");assert.equal(changed.tripDays,3);
});

test("multi-turn revisions update real plan conditions and preserve every other fact", () => {
  const initial = { cityName: "西安市", activityType: "校园运动会", date: "2026-10-24", participants: 30, group: "普通人群", intensity: "中强度", duration: 2, startHour: 14 };
  let known = initial;
  for (const message of ["如果改成一小时呢？", "参与者改成老人", "只看下午"]) {
    assert.equal(isPlanRevision(message, known), true, message);
    const response = turn(known, message);
    assert.equal(response.command, "analyze", message);
    known = response.intake.known;
  }
  assert.equal(known.cityName, "西安市"); assert.equal(known.duration, 1); assert.equal(known.group, "老年人");
  assert.equal(known.allowedStartHour, 12); assert.equal(known.allowedEndHour, 18); assert.equal(known.participants, 30);
  assert.equal(isPlanRevision("帮我画两天的对比图", known), true);
  assert.equal(isPlanRevision("为什么推荐这个时段", known), false);
});

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

test("seven university students completes the pending participants question", () => {
  const first = turn({}, "规划杭州未来三天的旅游路线");
  const second = turn(first.intake.known, "七个大学生");
  assert.equal(second.command, "analyze");
  assert.equal(second.patch.participants, 7);
  assert.equal(second.patch.group, "普通人群");
  assert.doesNotMatch(second.reply, /大约几个人/);
  assert.equal(second.patch.cityName, "杭州市");
});
test("participant nouns, Chinese tens and hundreds, and contextual bare counts are understood", () => {
  for (const [message, count] of [["十七名大学生",17],["二十一位研究生",21],["三百六十个学生",360],["8个同学",8],["两位老人",2]]) {
    assert.equal(turn({}, message).patch.participants, count, message);
  }
  assert.equal(turn({ activityType: "旅游规划", group: "普通人群" }, "七个").patch.participants, 7);
  assert.equal(turn({}, "三天").patch.participants, undefined);
});
