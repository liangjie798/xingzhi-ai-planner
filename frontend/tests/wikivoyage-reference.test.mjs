import test from "node:test";
import assert from "node:assert/strict";
import { extractWikivoyageReference, fetchWikivoyageReference } from "../src/lib/wikivoyage-server.ts";

const sample = `== 了解 ==
杭州是浙江省省会。
== 观光 ==
=== 西湖 ===
* '''西湖'''——位于城西，环湖骑行。
== 饮食 ==
* [[楼外楼]]——杭帮菜老字号。
== 住宿 ==
* 某酒店。
`;

test("only sightseeing, food and arrival sections are extracted and markup is stripped", () => {
  const excerpt = extractWikivoyageReference(sample);
  assert.match(excerpt, /西湖/);
  assert.match(excerpt, /楼外楼/);
  assert.doesNotMatch(excerpt, /某酒店|杭州是浙江省省会/);
  assert.doesNotMatch(excerpt, /\[\[|\{\{|'''/);
});

test("wikivoyage page becomes a cited reference", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ parse: { title: "杭州", wikitext: sample } }), { status: 200 });
  try {
    const reference = await fetchWikivoyageReference("杭州市");
    assert.equal(reference.platform, "Wikivoyage");
    assert.equal(reference.license, "CC BY-SA");
    assert.match(reference.title, /杭州市? · 维基导游路线参考/);
    assert.match(reference.url, /zh\.wikivoyage\.org\/wiki\//);
    assert.match(reference.excerpt, /西湖/);
  } finally { globalThis.fetch = originalFetch; }
});

test("missing pages do not fabricate a reference", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify({ error: { code: "missingtitle" } }), { status: 200 }); };
  try {
    assert.equal(await fetchWikivoyageReference("不存在城市测试"), null);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});
