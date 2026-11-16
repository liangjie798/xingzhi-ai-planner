import test from "node:test";
import assert from "node:assert/strict";
import { buildStopReason, acceptModelTip, catalogFeature, indoorPlace } from "../src/lib/tourism-reason.ts";

// 排程会按北京时间过滤过去时段，因此使用相对今天固定的未来日期，避免测试随时间失效。
const date = new Date(Date.now() + 3 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
const hours = (rain = 0, heat = 10, aqi = 40) => Array.from({ length: 24 }, (_, hour) => ({ date, hour, temperature: 20, humidity: 60, rainProbability: rain, aqi, heatRisk: heat }));
const poi = (name, extra = {}) => ({ name, longitude: 120.15, latitude: 30.25, tag: "博物馆", category: "景点", blurb: "", ...extra });
const visit = (place, extra = {}) => ({ poi: place, day: 1, date, time: "09:00", endTime: "10:30", visitMinutes: 90, queueMinutes: 0, restMinutes: 0, travelMinutes: 0, travelDistanceKm: 0, travelSource: "estimate", openingStatus: "待确认开放与预约；时段为保守排程假设", openingHours: undefined, weatherAssessment: "", ...extra });
const context = (extra = {}) => ({ hours: hours(), position: 1, dayTotal: 1, ...extra });

test("推荐理由按地点类型、商圈与当日位置生成，不再复用统一模板", () => {
  const museum = buildStopReason(visit(poi("杭州博物馆", { poiType: "科教文化服务;博物馆;综合博物馆", businessArea: "吴山", origin: "amap" })), context());
  const street = buildStopReason(visit(poi("清河坊历史街区", { poiType: "风景名胜;特色街区", businessArea: "吴山", origin: "amap", tag: "历史街区" })), context());
  assert.doesNotMatch(museum, /高德城市限定检索|建议结合天气与开放时间/);
  assert.match(museum, /综合博物馆/);
  assert.match(museum, /室内为主/);
  assert.match(museum, /吴山一带/);
  assert.match(museum, /作为当日首站/);
  assert.match(street, /特色街区/);
  assert.notEqual(museum, street);
  assert.ok(museum.endsWith("。"));
});

test("内置候选的季节与钟点文案只在匹配本次行程时使用", () => {
  const tulip = poi("太子湾公园", { origin: "catalog", blurb: "郁金香与樱花季顶流。", tag: "赏花胜地" });
  const november = buildStopReason(visit(tulip), context());
  assert.doesNotMatch(november, /郁金香|樱花|顶流/);
  assert.match(november, /公园/);

  const canal = poi("拱宸桥·桥西历史街区", { origin: "catalog", blurb: "京杭大运河夜游起点。", tag: "运河夜景" });
  assert.doesNotMatch(buildStopReason(visit(canal), context()), /夜游/);
  assert.match(buildStopReason(visit(canal, { time: "19:00", endTime: "20:00" }), context()), /夜游/);

  const palace = poi("故宫博物院", { origin: "catalog", blurb: "明清皇家宫殿，中轴线上的人气顶流。", tag: "经典必去" });
  const palaceReason = buildStopReason(visit(palace), context());
  assert.match(palaceReason, /明清皇家宫殿/);
  assert.doesNotMatch(palaceReason, /人气|顶流/);
});

test("餐饮理由说明用餐时段、距离与路况来源", () => {
  const reason = buildStopReason(visit(poi("杭州酒家（延安路店）", { poiType: "餐饮服务;中餐厅;浙江菜", businessArea: "延安路", origin: "amap", category: "美食", tag: "本地美食" }), { time: "11:45", endTime: "13:00", travelMinutes: 5, travelDistanceKm: 1.2, travelSource: "amap-driving" }), context({ position: 2, dayTotal: 3 }));
  assert.match(reason, /浙江菜馆/);
  assert.match(reason, /位于延安路/);
  assert.match(reason, /距上一站1.2公里/);
  assert.match(reason, /高德驾车约5分钟/);
  assert.match(reason, /衔接午餐/);
});

test("天气结论只覆盖实际停留窗口并区分室内外", () => {
  const museum = poi("杭州博物馆", { poiType: "科教文化服务;博物馆;综合博物馆", origin: "amap" });
  assert.match(buildStopReason(visit(museum), context({ hours: hours(90) })), /降水概率90%，室内参观受影响较小/);
  const park = poi("西湖·断桥残雪", { origin: "catalog", blurb: "白堤起点，环湖核心机位。", tag: "经典必去" });
  assert.match(buildStopReason(visit(park), context({ hours: hours(70) })), /降水概率70%，建议备好雨具/);
  assert.match(buildStopReason(visit(park), context({ hours: hours(10) })), /适合户外停留/);
});

test("模型理由只接受定性内容，数字、热度与营业说法会被拒绝", () => {
  assert.equal(acceptModelTip("老字号杭帮菜，适合团体用餐，菜品选择较多"), "老字号杭帮菜，适合团体用餐，菜品选择较多");
  assert.equal(acceptModelTip("推荐理由：适合亲子的室内展馆"), "适合亲子的室内展馆");
  assert.equal(acceptModelTip("高德评分4.8，距上一站2公里"), undefined);
  assert.equal(acceptModelTip("上午人少，适合先参观"), undefined);
  assert.equal(acceptModelTip("第1天适合参观"), undefined);
  assert.equal(acceptModelTip("太短"), undefined);
});

test("模型理由通过后仍由程序补齐距离与用餐事实", () => {
  const reason = buildStopReason(visit(poi("楼外楼（西湖店）", { category: "美食", tag: "杭帮菜", origin: "catalog", blurb: "西湖边的杭帮菜老字号，可体验东坡肉、龙井虾仁等代表菜。" }), { time: "11:45", endTime: "13:00", travelMinutes: 8, travelDistanceKm: 1.5, travelSource: "amap-driving" }), context({ position: 2, dayTotal: 4, modelTip: "老字号杭帮菜，适合团体用餐" }));
  assert.match(reason, /^老字号杭帮菜，适合团体用餐；/);
  assert.match(reason, /距上一站1.5公里/);
  assert.match(reason, /高德驾车约8分钟/);
  assert.match(reason, /衔接午餐/);
});

test("首站与末站的路线作用分别标注", () => {
  const first = buildStopReason(visit(poi("西湖", { tag: "经典必去" })), context());
  assert.match(first, /作为当日首站/);
  const last = buildStopReason(visit(poi("河坊街", { tag: "美食街区" }), { time: "17:30", endTime: "19:00", travelMinutes: 4, travelDistanceKm: 1, travelSource: "estimate" }), context({ position: 3, dayTotal: 3 }));
  assert.match(last, /距上一站1公里/);
  assert.match(last, /按坐标估算约4分钟/);
  assert.match(last, /作为当日最后一站/);
});

test("内置候选只在有效季节时段通过描述校验", () => {
  const hype = { name: "太子湾公园", tag: "赏花胜地", blurb: "郁金香与樱花季顶流。", origin: "catalog" };
  assert.equal(catalogFeature(hype, 9 * 60, 4), undefined);
  const cherry = { name: "太子湾公园", tag: "赏花胜地", blurb: "春日的樱花与草坪。", origin: "catalog" };
  assert.equal(catalogFeature(cherry, 9 * 60, 11), undefined);
  assert.match(catalogFeature(cherry, 9 * 60, 4), /樱花/);
  assert.equal(indoorPlace({ name: "杭州博物馆", tag: "博物馆" }), true);
  assert.equal(indoorPlace({ name: "西湖", tag: "景点" }), false);
});

test("排程结果逐站写入推荐理由并使用模型定性理由", async () => {
  const { buildScheduledStops } = await import("../src/lib/tourism-scheduled-route.ts");
  const dayHours = Array.from({ length: 24 }, (_, hour) => ({ date, hour, temperature: 20, humidity: 55, rainProbability: 0, aqi: 40, heatRisk: 10 }));
  const candidates = [
    poi("杭州博物馆", { poiType: "科教文化服务;博物馆;综合博物馆", businessArea: "吴山", origin: "amap" }),
    poi("西湖·断桥残雪", { origin: "catalog", blurb: "白堤起点，环湖核心机位。", tag: "经典必去", longitude: 120.14 }),
    poi("清河坊历史街区", { poiType: "风景名胜;特色街区", businessArea: "吴山", origin: "amap", tag: "历史街区", longitude: 120.16, latitude: 30.24 }),
    poi("杭州酒家（延安路店）", { category: "美食", tag: "本地美食", poiType: "餐饮服务;中餐厅;浙江菜", businessArea: "延安路", origin: "amap", longitude: 120.16, latitude: 30.25 }),
  ];
  const enrich = async (place, time, day, visitDate) => ({ name: place.name, longitude: place.longitude, latitude: place.latitude, time, day, date: visitDate, tip: place.blurb, tag: place.tag, category: place.category, links: [], openingStatus: "待确认开放与预约；时段为保守排程假设" });
  const { stops } = await buildScheduledStops({ cityName: "杭州市", date, endDate: date, hours: dayHours, participants: 3, allowedStartHour: 8, allowedEndHour: 20 }, candidates, [date], enrich, { tips: { "杭州酒家（延安路店）": "老字号杭帮菜，适合团体用餐" } });
  assert.ok(stops.length >= 3);
  assert.ok(stops.every((stop) => stop.tip.endsWith("。")));
  assert.match(stops[0].tip, /作为当日首站/);
  assert.equal(new Set(stops.map((stop) => stop.tip)).size, stops.length);
  const restaurant = stops.find((stop) => stop.name === "杭州酒家（延安路店）");
  assert.match(restaurant.tip, /^老字号杭帮菜，适合团体用餐；/);
  assert.match(restaurant.tip, /衔接午餐|安排晚餐/);
  assert.doesNotMatch(restaurant.tip, /高德城市限定检索/);
});
test("street names are not misread as water features", () => {
  const reason = buildStopReason(visit(poi("清河坊历史文化特色街区", { origin: "amap", tag: "历史街区" })), context());
  assert.match(reason, /街区/);
  assert.doesNotMatch(reason, /亲水景观/);
});
test("catalog copy does not claim an afternoon slot at 11:30", () => {
  const place = { name: "清河坊历史街区", origin: "catalog", category: "美食", tag: "美食街区", blurb: "南宋御街旁的老字号与小食，适合作为边逛边吃的午后停靠点。" };
  const morning = buildStopReason(visit(place, { time: "11:30", endTime: "13:00" }), context({ position: 2, dayTotal: 3 }));
  assert.doesNotMatch(morning, /午后/);
  assert.match(morning, /南宋御街旁的老字号与小食/);
  const afternoon = buildStopReason(visit(place, { time: "14:00", endTime: "15:30" }), context({ position: 2, dayTotal: 3 }));
  assert.match(afternoon, /午后/);
});
