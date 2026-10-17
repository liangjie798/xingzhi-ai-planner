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
    label: "免费开源 · Pollinations（无需密钥）",
    baseUrl: "https://text.pollinations.ai/openai",
    model: "mistral",
    apiKeyRequired: false,
    note: "默认选项。托管开源模型（Mistral 等），无需注册与密钥即可调用。",
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
    note: "填写任意 OpenAI 兼容的服务地址（如 vLLM、Ollama、OneAPI），以 /chat/completions 结尾由系统自动拼接。",
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
