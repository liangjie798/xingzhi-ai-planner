import { NextResponse } from "next/server";
import { callLlm } from "@/lib/llm-server";
import type { ClientModelConfig } from "@/lib/llm-server";

interface LlmRequestBody {
  system?: string;
  prompt?: string;
  config?: ClientModelConfig;
  imageDataUrl?: string;
}

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: LlmRequestBody;
  try {
    body = await request.json() as LlmRequestBody;
  } catch {
    return NextResponse.json({ detail: "请求体不是合法 JSON" }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ detail: "缺少 prompt 参数" }, { status: 400 });
  }
  if (prompt.length > 12_000) return NextResponse.json({ detail: "prompt 过长" }, { status: 413 });
  if (body.imageDataUrl && (!/^data:image\/(jpeg|png|webp);base64,/i.test(body.imageDataUrl) || body.imageDataUrl.length > 5_500_000))
    return NextResponse.json({ detail: "图片格式或大小不符合要求" }, { status: 413 });

  try {
    const result = await callLlm({ system: body.system, prompt, imageDataUrl: body.imageDataUrl, config: body.config });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "大模型调用失败" },
      { status: 502 },
    );
  }
}
