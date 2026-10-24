import test from "node:test";
import assert from "node:assert/strict";
import { callLlm, extractJson } from "../src/lib/llm-server.ts";

test("structured plans tolerate gateways that escape JSON content twice", () => {
  const plan = { summary: "杭州三天", stops: [{ name: '西湖“断桥”', day: 1, time: "09:00" }] };
  const text = JSON.stringify(plan);
  assert.deepEqual(extractJson(text), plan);
  assert.deepEqual(extractJson(JSON.stringify(text)), plan);
  assert.deepEqual(extractJson(JSON.stringify(text).slice(1, -1)), plan);
  assert.deepEqual(extractJson("```json\n" + JSON.stringify(text).slice(1, -1) + "\n```"), plan);
  assert.equal(extractJson('{"stops":['), null);
  assert.deepEqual(extractJson('{"summary":"杭州", "stops": [{"name":"西湖", "day":1,}],}'), { summary: "杭州", stops: [{ name: "西湖", day: 1 }] });
  assert.deepEqual(extractJson('{"summary":"杭州" "stops":[]}'), { summary: "杭州", stops: [] });
});

test("no configured model fails immediately without an anonymous network request", async () => {
  const saved = [process.env.SILICONFLOW_API_KEY, process.env.DEEPSEEK_API_KEY];
  const original = globalThis.fetch;
  delete process.env.SILICONFLOW_API_KEY; delete process.env.DEEPSEEK_API_KEY;
  globalThis.fetch = async () => { throw new Error("unexpected-network-request"); };
  try { await assert.rejects(callLlm({ prompt: "test" }), /未配置可用大模型/); }
  finally { globalThis.fetch = original; ["SILICONFLOW_API_KEY","DEEPSEEK_API_KEY"].forEach((key,index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; }); }
});

test("model output limits are configurable and truncated JSON is not accepted as success", async () => {
  const saved = [process.env.SILICONFLOW_API_KEY, process.env.DEEPSEEK_API_KEY];
  const original = globalThis.fetch;
  process.env.SILICONFLOW_API_KEY = "unit-test-key"; delete process.env.DEEPSEEK_API_KEY;
  globalThis.fetch = async (_url, init) => {
    assert.equal(JSON.parse(init.body).max_tokens, 3200);
    assert.deepEqual(JSON.parse(init.body).response_format, { type: "json_object" });
    return Response.json({ choices: [{ finish_reason: "length", message: { content: '{"stops":[' } }] });
  };
  try {
    await assert.rejects(callLlm({ prompt: "test", maxTokens: 3200, jsonMode: true }), /被截断/);
    assert.equal(extractJson("not JSON"), null);
    globalThis.fetch = async () => new Response("sensitive-upstream-body", { status: 401 });
    await assert.rejects(callLlm({ prompt: "test" }), (error) => /密钥无效/.test(error.message) && !error.message.includes("sensitive-upstream-body"));
  } finally { globalThis.fetch = original; ["SILICONFLOW_API_KEY","DEEPSEEK_API_KEY"].forEach((key,index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; }); }
});
