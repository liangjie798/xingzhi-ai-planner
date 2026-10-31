import { NextResponse } from "next/server";
import { callLlm } from "@/lib/llm-server";
import { resolveAccountModelConfig } from "@/lib/account-model-config-server";
import { isRecord } from "@/lib/request-validation";

interface LlmRequestBody {
  system?: string;
  prompt?: string;
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

  if (!isRecord(body) || typeof body.prompt !== "string" || body.system !== undefined && typeof body.system !== "string") return NextResponse.json({ detail: "prompt 必须为文本，请求体必须为 JSON 对象" }, { status: 400 });
  const prompt = body.prompt.trim();
  if (!prompt) {
    return NextResponse.json({ detail: "缺少 prompt 参数" }, { status: 400 });
  }
  if (prompt.length > 12_000) return NextResponse.json({ detail: "prompt 过长" }, { status: 413 });
  if (body.imageDataUrl !== undefined && (typeof body.imageDataUrl !== "string" || !/^data:image\/(jpeg|png|webp);base64,/i.test(body.imageDataUrl) || body.imageDataUrl.length > 5_500_000))
    return NextResponse.json({ detail: "图片格式或大小不符合要求" }, { status: 413 });

  try {
    const config = await resolveAccountModelConfig(request);
    const result = await callLlm({ system: body.system, prompt, imageDataUrl: body.imageDataUrl, config });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, code: modelFailureCode(error), detail: error instanceof Error ? error.message : "大模型调用失败" },
      { status: 502 },
    );
  }
}

function modelFailureCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /未配置/.test(message) ? "not_configured" : /密钥无效|权限不足/.test(message) ? "authentication_failed" : /额度不足|请求受限/.test(message) ? "quota_or_rate_limit" : /超时/.test(message) ? "timeout" : /不存在/.test(message) ? "model_or_endpoint_not_found" : "provider_error";
}
