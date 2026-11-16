import test from 'node:test';
import assert from 'node:assert/strict';
import { routeDiagram } from '../src/lib/planning-visuals.ts';

const stop = (index, name, category = '景点') => ({
  name, category, time: `0${8 + index}:00`, endTime: `0${9 + index}:00`,
  day: 1, date: '2026-11-14', visitMinutes: 60, queueMinutes: 0, restMinutes: 0,
  travelMinutes: 0, travelDistanceKm: 0, travelSource: 'estimate', openingStatus: '待确认', weatherAssessment: '',
});

function parse(svg) {
  const decoded = decodeURIComponent(svg.split(',')[1]);
  const width = Number(decoded.match(/width="(\d+)"/)[1]);
  const positions = [...decoded.matchAll(/translate\(([\d.]+) 84\)/g)].map((match) => Number(match[1]));
  return { decoded, width, positions };
}

test('行程示意图为长地名增加画布宽度并保留左右留白', () => {
  const stops = [stop(0, '杭州西湖博物馆总馆'), stop(1, '绿茶餐厅(龙井路店)', '美食'), stop(2, '浙江省博物馆(孤山馆区)'), stop(3, '楼外楼（西湖店）', '美食')];
  const { decoded, width, positions } = parse(routeDiagram(stops));
  assert.equal(positions.length, 4);
  assert.ok(width >= 900, width);
  assert.ok(positions[0] >= 90, positions);
  assert.ok(positions.at(-1) <= width - 90, { width, last: positions.at(-1) });
  assert.ok(positions.every((value) => value >= 0 && value <= width), positions);
  // 超过 10 个字的名称使用省略号，而不是硬截断后溢出
  assert.ok(/…/.test(decoded), 'long name should be ellipsized');
  assert.ok(decoded.includes('非道路导航'));
});

test('点位较多时画布自动变宽，相邻节点保持间距', () => {
  const stops = Array.from({ length: 6 }, (_, index) => stop(index, `第${index + 1}站测试景点名称`, index % 2 ? '美食' : '景点'));
  const { width, positions } = parse(routeDiagram(stops));
  assert.ok(width > 900, width);
  assert.equal(positions.length, 6);
  assert.ok(positions.at(-1) <= width - 90, { width, last: positions.at(-1) });
  for (let index = 1; index < positions.length; index++) assert.ok(positions[index] - positions[index - 1] >= 150, positions);
});
