import test from 'node:test';
import assert from 'node:assert/strict';
import { retrieveRag, ragSources, ragEvidence, ragKnowledgeSize } from '../src/lib/rag-knowledge.ts';
import { applyMemoryPolicy, mergeHistoryFacts, memoryLabel, stripKnownQuestions, askedFieldsFromAssistant } from '../src/lib/conversation-memory.ts';

test('RAG 知识库可从本地文档检索雨天与城市资料', () => {
  assert.ok(ragKnowledgeSize() >= 20, `文档数 ${ragKnowledgeSize()}`);
  const rain = retrieveRag('下雨天行程怎么安排');
  assert.ok(rain.length >= 1, 'rain hit missing');
  assert.ok(rain.some((hit) => hit.id.includes('rain') || hit.text.includes('雨天')), rain.map((hit) => hit.id));
  const city = retrieveRag('西安有什么好玩的', { city: '西安' });
  assert.ok(city.some((hit) => hit.kind === 'city' && hit.title.startsWith('西安')), city.map((hit) => hit.title));
  const sources = ragSources(rain.slice(0, 2));
  assert.ok(sources.every((source) => source.title.startsWith('知识库 · ')));
  assert.ok(ragEvidence(rain.slice(0, 2)).includes('[K1]'));
});

test('对话记忆从历史回捞城市、日期、人数和天数', () => {
  const history = [
    { role: 'user', content: '我想去杭州玩' },
    { role: 'assistant', content: '好的，还需要了解：1. 哪天出发？2. 计划玩几天？3. 大约几个人参加？' },
    { role: 'user', content: '明天出发，两个人，玩三天' },
  ];
  const merged = mergeHistoryFacts(history, '2026-11-13', {});
  assert.equal(merged.known.cityName, '杭州');
  assert.equal(merged.known.activityType, '旅游规划');
  assert.equal(merged.known.date, '2026-11-14');
  assert.equal(merged.known.participants, 2);
  assert.equal(merged.known.tripDays, 3);
});

test('上一轮问过但用户没补充的字段改用默认值，不再重复追问', () => {
  const known = { activityType: '旅游规划', cityName: '杭州', date: '2026-11-14' };
  const history = [
    { role: 'user', content: '我想去杭州玩' },
    { role: 'assistant', content: '好的，还需要了解：1. 计划玩几天？2. 大约几个人参加？3. 同行或参与者是成年人还是其他人群？' },
    { role: 'user', content: '嗯，先这样' },
  ];
  const policy = applyMemoryPolicy(known, history, '2026-11-13');
  assert.equal(policy.intake.command, 'analyze', policy.intake.reply);
  assert.equal(policy.known.tripDays, 2);
  assert.equal(policy.known.participants, 1);
  assert.ok(policy.defaultsApplied.includes('人数'));
  assert.ok(!/玩几天|几个人/.test(policy.intake.reply));
  assert.equal(askedFieldsFromAssistant(history[1].content).length >= 3, true);
});

test('已知条件的问题不会重复出现在追问列表里', () => {
  const reply = '还需要了解：\n1. 想去哪个城市或区县？\n2. 计划玩几天？';
  const cleaned = stripKnownQuestions(reply, { cityName: '杭州' });
  assert.ok(!cleaned.includes('哪个城市'));
  assert.ok(cleaned.includes('玩几天'));
});

test('记忆摘要展示已确认的条件', () => {
  const label = memoryLabel({ cityName: '杭州', date: '2026-11-14', participants: 2, activityType: '旅游规划' });
  assert.ok(label.includes('杭州'));
  assert.ok(label.includes('2026-11-14'));
  assert.ok(label.includes('2 人'));
});
