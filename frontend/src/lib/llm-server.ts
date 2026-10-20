/**
 * 服务端大模型调用工具（OpenAI 兼容 chat/completions 协议）。
 * 调用优先级：
 *   1. 用户在「AI 模型配置」页保存的自定义配置（随请求传入）
 *   2. 环境变量 SILICONFLOW_API_KEY（硅基流动，开源 Qwen 系列）
 *   3. 环境变量 DEEPSEEK_API_KEY（DeepSeek）
 *   4. 免费开源兜底：Pollinations 托管的开源模型（无需任何密钥）
 */

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

const TIMEOUT_MS = 32_000;

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
  list.push({
    name: "Pollinations（免费开源）",
    endpoint: "https://text.pollinations.ai/openai/chat/completions",
    model: "openai-fast",
    apiKey: "",
  });
  return list;
}

async function callProvider(spec: ProviderSpec, messages: ChatMessage[]): Promise<string> {
  if (spec.userProvided) await assertPublicEndpoint(spec.endpoint);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (spec.apiKey) headers.Authorization = `Bearer ${spec.apiKey}`;

  const response = await fetch(spec.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: spec.model, messages, temperature: 0.6, max_tokens: 1400 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${spec.name} 返回 ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${spec.name} 返回内容为空`);
  return text;
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
  for (const spec of providersFrom(request.config)) {
    try {
      const text = await callProvider(spec, messages);
      return { text, provider: spec.name, model: spec.model };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`大模型暂不可用（${errors.join("；")}）`);
}

/** 从模型输出中稳健提取 JSON 对象（容忍代码块围栏与前后缀文字） */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
