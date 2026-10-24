import type { ModelConfig } from "./types";

export const MODEL_STORAGE_KEY = "shihou:model-config";

export interface ModelPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKeyRequired: boolean;
  note: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: "pollinations",
    label: "Pollinations · 可选模型服务",
    baseUrl: "https://text.pollinations.ai/openai",
    model: "openai-fast",
    apiKeyRequired: false,
    note: "请按服务商当前要求填写模型和授权密钥。匿名服务可用性不保证；未绑定模型时，系统使用天气与地点规则规划并显示原因。",
  },
  {
    id: "siliconflow",
    label: "硅基流动 · Qwen2.5-7B（开源，免费额度）",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen2.5-7B-Instruct",
    apiKeyRequired: true,
    note: "国内可直连的开源模型服务，注册后在控制台创建 API 密钥填入。",
  },
  {
    id: "deepseek",
    label: "DeepSeek（deepseek-chat）",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    apiKeyRequired: true,
    note: "效果更好的通用模型，按量计费。",
  },
  {
    id: "custom",
    label: "自定义（OpenAI 兼容接口）",
    baseUrl: "",
    model: "",
    apiKeyRequired: false,
    note: "填写任意 OpenAI 兼容的 Base URL 或完整 /chat/completions 地址，系统会自动识别，避免重复拼接造成 404。",
  },
];

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  providerId: "pollinations",
  providerLabel: MODEL_PRESETS[0].label,
  baseUrl: MODEL_PRESETS[0].baseUrl,
  apiKey: "",
  model: MODEL_PRESETS[0].model,
};

export function readModelConfig(): ModelConfig {
  try {
    const raw = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MODEL_CONFIG };
    const parsed = JSON.parse(raw) as Partial<ModelConfig>;
    if (!parsed.baseUrl || !parsed.model) return { ...DEFAULT_MODEL_CONFIG };
    return {
      providerId: parsed.providerId || "custom",
      providerLabel: parsed.providerLabel || "自定义",
      baseUrl: parsed.baseUrl,
      apiKey: parsed.apiKey || "",
      model: parsed.model,
    };
  } catch {
    return { ...DEFAULT_MODEL_CONFIG };
  }
}

export function saveModelConfig(config: ModelConfig) {
  window.localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(config));
}

interface AccountModelConfig extends Partial<ModelConfig> { configured?: boolean; hasApiKey?: boolean }

export async function readAccountModelConfig(): Promise<{ config: ModelConfig; bound: boolean; hasApiKey: boolean }> {
  const response = await fetch("/api/v1/account/model-config", { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401 || response.status === 403) throw new Error("请先登录用户账户，再绑定模型配置");
  if (!response.ok) throw new Error("账户模型配置读取失败");
  const stored = await response.json() as AccountModelConfig;
  if (!stored.configured || !stored.baseUrl || !stored.model) return { config: { ...DEFAULT_MODEL_CONFIG }, bound: false, hasApiKey: false };
  return { config: {
    providerId: stored.providerId || "custom", providerLabel: stored.providerLabel || "自定义",
    baseUrl: stored.baseUrl, apiKey: "", model: stored.model,
  }, bound: true, hasApiKey: Boolean(stored.hasApiKey) };
}

export async function saveAccountModelConfig(config: ModelConfig): Promise<void> {
  const { csrf } = await import("./auth");
  const token = await csrf();
  const response = await fetch("/api/v1/account/model-config", {
    method: "PUT", credentials: "same-origin",
    headers: { "Content-Type": "application/json", [token.headerName]: token.token },
    body: JSON.stringify(config),
  });
  if (response.status === 401 || response.status === 403) throw new Error("请先登录用户账户，再绑定模型配置");
  const body = await response.json().catch(() => null) as { detail?: string } | null;
  if (!response.ok) throw new Error(body?.detail || "模型配置保存失败");
  window.localStorage.removeItem(MODEL_STORAGE_KEY);
}
