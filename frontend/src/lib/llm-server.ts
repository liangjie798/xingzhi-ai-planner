/**
 * 服务端大模型调用工具（OpenAI 兼容 chat/completions 协议）。
 * 调用优先级：
 *   1. 用户在「AI 模型配置」页保存的自定义配置（随请求传入）
 *   2. 环境变量 SILICONFLOW_API_KEY（硅基流动，开源 Qwen 系列）
 *   3. 环境变量 DEEPSEEK_API_KEY（DeepSeek）
 * 不自动请求无法保证可用的匿名服务；未配置时立即返回可操作的原因。
 */

import { jsonrepair } from "jsonrepair";

export interface ClientModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmRequest {
  system?: string;
  prompt: string;
  imageDataUrl?: string;
  config?: ClientModelConfig;
  timeoutMs?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LlmResult {
  text: string;
  provider: string;
  model: string;
}

type MessageContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
interface ChatMessage {
  role: "system" | "user";
  content: MessageContent;
}

interface ProviderSpec {
  name: string;
  endpoint: string;
  model: string;
  apiKey: string;
  userProvided?: boolean;
}

const TIMEOUT_MS = 24_000;

function normalizeEndpoint(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

function providersFrom(clientConfig?: ClientModelConfig): ProviderSpec[] {
  const list: ProviderSpec[] = [];
  if (clientConfig?.baseUrl && clientConfig?.model) {
    list.push({
      name: "用户自定义模型",
      endpoint: normalizeEndpoint(clientConfig.baseUrl),
      model: clientConfig.model,
      apiKey: clientConfig.apiKey?.trim() || "",
      userProvided: true,
    });
  }
  if (process.env.SILICONFLOW_API_KEY) {
    list.push({
      name: "硅基流动（开源 Qwen）",
      endpoint: "https://api.siliconflow.cn/v1/chat/completions",
      model: process.env.SILICONFLOW_MODEL || "Qwen/Qwen2.5-7B-Instruct",
      apiKey: process.env.SILICONFLOW_API_KEY,
    });
  }
  if (process.env.DEEPSEEK_API_KEY) {
    list.push({
      name: "DeepSeek",
      endpoint: "https://api.deepseek.com/chat/completions",
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      apiKey: process.env.DEEPSEEK_API_KEY,
    });
  }
  return list;
}

async function callProvider(spec: ProviderSpec, messages: ChatMessage[], timeoutMs: number, maxTokens: number, jsonMode = false): Promise<{text:string;model:string}> {
  if (spec.userProvided) await assertPublicEndpoint(spec.endpoint);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (spec.apiKey) headers.Authorization = `Bearer ${spec.apiKey}`;

  const response = await fetch(spec.endpoint, {
    method: "POST",
    redirect: "error",
    headers,
    body: JSON.stringify({ model: spec.model, messages, temperature: jsonMode ? 0.2 : 0.6, max_tokens: maxTokens, ...(jsonMode ? { response_format: { type: "json_object" } } : {}) }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`${spec.name}：${response.status === 401 || response.status === 403 ? "模型密钥无效或权限不足" : response.status === 404 ? "模型接口或模型名称不存在（404）" : response.status === 429 ? "模型额度不足或请求受限" : `模型服务返回 ${response.status}`}`);
  }
  const data = await response.json() as { model?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };
  if (data.choices?.[0]?.finish_reason === "length") throw new Error(`${spec.name}：模型输出被截断，请缩短行程或使用支持更长输出的模型`);
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${spec.name} 返回内容为空`);
  return {text,model:typeof data.model === "string" && data.model.trim() ? data.model : `${spec.model}（请求模型，接口未返回模型标识）`};
}

async function assertPublicEndpoint(endpoint: string) {
  const { isIP } = await import("node:net");
  const { lookup } = await import("node:dns/promises");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1"].includes(url.hostname)))
    throw new Error("自定义模型地址必须使用 HTTPS");
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
  const blocked = addresses.some(({ address }) => /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(address));
  if (blocked) throw new Error("自定义模型地址不能指向本机或内网地址");
}

export async function callLlm(request: LlmRequest): Promise<LlmResult> {
  const messages: ChatMessage[] = [];
  if (request.system) messages.push({ role: "system", content: request.system });
  messages.push({ role: "user", content: request.imageDataUrl
    ? [{ type: "text", text: request.prompt }, { type: "image_url", image_url: { url: request.imageDataUrl } }]
    : request.prompt });

  const errors: string[] = [];
  const providers = providersFrom(request.config);
  if (!providers.length) throw new Error("未配置可用大模型。请在 AI 模型设置中保存有调用权限的模型配置；百度搜索密钥只用于搜索。");
  const deadline = Date.now() + Math.min(TIMEOUT_MS, Math.max(1000, request.timeoutMs ?? TIMEOUT_MS));
  for (const spec of providers) {
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) { errors.push("模型调用总等待时间已到，已停止重试"); break; }
      const anonymous = !spec.apiKey && /pollinations\.ai/.test(spec.endpoint);
      const reply = await callProvider(spec, messages, anonymous ? Math.min(4000, remaining) : remaining, Math.min(4000, Math.max(256, request.maxTokens ?? 1400)), request.jsonMode);
      return { ...reply, provider: spec.name };
    } catch (error) {
      errors.push(error instanceof Error && /Timeout|Abort/.test(error.name) ? `${spec.name}：模型请求超时` : error instanceof Error ? error.message : "模型调用失败");
    }
  }
  throw new Error(`大模型暂不可用（${errors.join("；")}）`);
}

/** 从模型输出中稳健提取 JSON 对象（容忍代码块围栏与前后缀文字） */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = fenced ? fenced[1] : text;
  // Some compatible gateways encode message.content's JSON a second time.
  // Decode at most twice, using JSON parsing rather than executing or repairing content.
  for (let attempt = 0; attempt < 3; attempt++) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const fragment = candidate.slice(start, end + 1);
    try { return JSON.parse(fragment) as T; }
    catch {
      // Repair syntax only; the caller must still validate the returned route/fields.
      if (fragment.length < 16000) {
        try {
          const repaired = JSON.parse(jsonrepair(fragment));
          if (repaired && typeof repaired === "object" && !Array.isArray(repaired)) return repaired as T;
        } catch { /* Try decoding a gateway's extra string encoding next. */ }
      }
      try {
        const decoded = JSON.parse('"' + fragment.replace(/\r/g, "\\r").replace(/\n/g, "\\n") + '"');
        if (typeof decoded !== "string" || decoded === fragment) return null;
        candidate = decoded;
      } catch { return null; }
    }
  }
  return null;
}
