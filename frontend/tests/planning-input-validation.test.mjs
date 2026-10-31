import test from 'node:test';
import assert from 'node:assert/strict';
import { hasValidConversationContext, isCalendarDate, isTourismHour } from '../src/lib/planning-input-validation.ts';
import { conversationInputIssues, retainValidConversationInput } from '../src/lib/conversation-validation.ts';

const today = '2026-10-29';
const hour = { date: today, hour: 14, temperature: 20, humidity: 50, rainProbability: 0, aqi: 40, heatRisk: 5 };

test('Chinese invalid durations cannot silently retain a previously valid duration', () => {
  const previous = { cityName: '杭州市', duration: 2, participants: 40 };
  for (const text of ['九小时', '十个小时', '零小时', '〇小时', '负九小时', '二点五小时', '两小时改成九小时']) {
    assert.ok(conversationInputIssues(`活动时长改成${text}`, today).some(issue => issue.fields.includes('duration')), text);
    const retained = retainValidConversationInput(`西安，活动时长改成${text}`, today, previous);
    assert.equal(retained.known.duration, 2);
    assert.equal(retained.known.cityName, '西安市');
    assert.match(retained.reply, /本次未重新计算/);
  }
  for (const text of ['一小时', '八小时', '两个小时', '8小时']) assert.deepEqual(conversationInputIssues(text, today), []);
});

test('chart dates must be real ISO calendar dates, including leap years', () => {
  for (const date of ['not-a-date', '2026-02-30', '2026-02-29', '2026-13-01', '2026-1-01', null]) {
    assert.equal(isCalendarDate(date), false);
    assert.equal(hasValidConversationContext({ chartContext: { dates: [date], metrics: ['temperature'] } }), false);
  }
  assert.equal(isCalendarDate('2028-02-29'), true);
});

test('chart city and history types are rejected before context normalization', () => {
  for (const cityName of [{ bad: true }, ['杭州市'], 123, null, '  ']) assert.equal(hasValidConversationContext({ chartContext: { cityName, dates: [today], metrics: ['temperature'] } }), false);
  for (const history of [{}, null, 'history', [null], [{role: ['user'], content: '你好'}], [{role: 'system', content: '你好'}], [{role: 'user', content: 1}]]) assert.equal(hasValidConversationContext({ history }), false);
  assert.equal(hasValidConversationContext({history: []}), true);
  assert.equal(hasValidConversationContext({history: [{role: 'user', content: '你好'}], chartContext: {cityName: '杭州市', dates: [today], metrics: ['temperature', 'rainProbability']}}), true);
  assert.equal(hasValidConversationContext({chartContext: {dates: [today], metrics: [['temperature']]}}), false);
});

for (const [field, max] of [['humidity',100], ['rainProbability',100], ['aqi',500], ['heatRisk',100]]) {
  test(`${field} rejects out-of-domain/non-numeric input and accepts both bounds`, () => {
    for (const value of [-1, max + 1, NaN, Infinity, null, String(max)]) assert.equal(isTourismHour({...hour, [field]: value}), false, `${field}=${value}`);
    for (const value of [0, max]) assert.equal(isTourismHour({...hour, [field]: value}), true);
  });
}

test('ordinary winter forecasts remain valid; malformed dates and hours do not', () => {
  assert.equal(isTourismHour({...hour,temperature:-20}), true);
  for (const patch of [{hour:24},{hour:1.5},{temperature:Infinity},{date:'2026-02-30'}]) assert.equal(isTourismHour({...hour,...patch}), false);
});
