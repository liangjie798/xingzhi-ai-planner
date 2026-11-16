import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyLocations, validPlaceName } from '../src/lib/journey.ts';
import { extractIntake, cleanIntake } from '../src/lib/conversation-intake.ts';

const today = '2026-11-13';

test('时间/意图词不会被误识别为出发地', () => {
  const cases = [
    ['周末想去杭州玩两天，行程轻松一点。', '杭州'],
    ['帮我规划一个周末去杭州的行程', '杭州'],
    ['两个人去杭州玩两天，预算一千', '杭州'],
    ['想坐高铁去杭州', '杭州'],
  ];
  for (const [message, destination] of cases) {
    const journey = journeyLocations(message);
    assert.equal(journey.originCity, undefined, message);
    assert.equal(journey.destination, destination, message);
  }
  const noDestination = journeyLocations('周末想出去玩');
  assert.equal(noDestination.originCity, undefined);
  assert.equal(noDestination.destination, undefined);
});

test('正常出发地与目的地仍然可以解析', () => {
  assert.deepEqual(journeyLocations('明天从北京去上海'), { originCity: '北京', destination: '上海' });
  assert.deepEqual(journeyLocations('从西安出发去成都'), { originCity: '西安', destination: '成都' });
  assert.deepEqual(journeyLocations('明天西安到榆林'), { originCity: '西安', destination: '榆林' });
  assert.deepEqual(journeyLocations('从北京出发，去上海看展览'), { originCity: '北京', destination: '上海' });
});

test('地名合法性校验与脏数据清理', () => {
  for (const valid of ['北京', '杭州市', '西湖区', '天水', '日照', '乌鲁木齐']) assert.equal(validPlaceName(valid), true, valid);
  for (const invalid of ['周末想', '两个人', '想坐高铁', '上海看展览', '帮我规划一个周末']) assert.equal(validPlaceName(invalid), false, invalid);
  const cleaned = cleanIntake({ originCity: '周末想', journeyDestination: '上海看展览', cityName: '杭州市' });
  assert.equal(cleaned.originCity, undefined);
  assert.equal(cleaned.journeyDestination, undefined);
  assert.equal(cleaned.cityName, '杭州市');
});

test('规划消息不再产生交通出发地，城市/天数正常', () => {
  const patch = extractIntake('周末想去杭州玩两天，行程轻松一点。', today, {});
  assert.equal(patch.originCity, undefined);
  assert.equal(patch.cityName, '杭州');
  assert.equal(patch.activityType, '旅游规划');
  assert.equal(patch.tripDays, 2);
});
