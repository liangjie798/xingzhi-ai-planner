import test from "node:test";
import assert from "node:assert/strict";
import { callLlm } from "../src/lib/llm-server.ts";

test("model proof uses a real completion response and returned model metadata; failures never succeed", async () => {
  const originalFetch=globalThis.fetch;
  const saved=process.env.DEEPSEEK_API_KEY;
  const silicon=process.env.SILICONFLOW_API_KEY;
  delete process.env.SILICONFLOW_API_KEY;
  process.env.DEEPSEEK_API_KEY="test-only-placeholder";
  try {
    let requests=0;
    globalThis.fetch=async (url, options)=>{
      requests++; assert.match(String(url),/chat\/completions$/);
      assert.equal(JSON.parse(options.body).messages.at(-1).content,"你是什么模型？");
      return Response.json({model:"actual-model-version",choices:[{message:{content:"这是接口的回答"}}]});
    };
    const result=await callLlm({prompt:"你是什么模型？"});
    assert.equal(requests,1);assert.equal(result.text,"这是接口的回答");assert.equal(result.model,"actual-model-version");
    globalThis.fetch=async()=>new Response("Payment required",{status:402});
    await assert.rejects(callLlm({prompt:"你是什么模型？"}),/402/);
    delete process.env.DEEPSEEK_API_KEY;
    await assert.rejects(callLlm({prompt:"你是什么模型？"}),/未配置可用大模型/);
  } finally {
    globalThis.fetch=originalFetch;
    if(saved===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=saved;
    if(silicon===undefined)delete process.env.SILICONFLOW_API_KEY;else process.env.SILICONFLOW_API_KEY=silicon;
  }
});
