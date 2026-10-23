import test from "node:test";
import assert from "node:assert/strict";
import { mergeNationalSamples, nationalLocations } from "../src/lib/national-environment.ts";

test("nationwide sampling covers 34 distinct province-level locations", () => {
  assert.equal(nationalLocations.length, 34);
  assert.equal(new Set(nationalLocations.map((point) => point[0])).size, 34);
});
test("national samples preserve real zero values, timestamps and consistent environment scoring", () => {
  const weather = [{ current: { temperature_2m: 0, relative_humidity_2m: 50, apparent_temperature: -1, time: "2026-10-24T03:15" }, hourly: { time: ["2026-10-24T03:00"], precipitation_probability: [0] } }];
  const air = [{ current: { us_aqi: 0 } }];
  const samples = mergeNationalSamples(nationalLocations.slice(0, 1), weather, air);
  assert.equal(samples.length, 1);
  assert.equal(samples[0].temperature, 0);
  assert.equal(samples[0].heatRisk, 24);
  assert.equal(samples[0].observedAt, "2026-10-24T03:15+08:00");
  assert.equal(samples[0].adcode, "110000");
});
test("missing weather, air or matching rain hour are never replaced with fabricated zeroes", () => {
  const weather = [{ current: { temperature_2m: 12, relative_humidity_2m: 50, apparent_temperature: 11, time: "2026-10-24T03:15" }, hourly: { time: ["2026-10-24T03:00"], precipitation_probability: [null] } }];
  assert.deepEqual(mergeNationalSamples(nationalLocations.slice(0, 1), weather, [{ current: { us_aqi: 40 } }]), []);
  assert.deepEqual(mergeNationalSamples(nationalLocations.slice(0, 1), [], []), []);
});
