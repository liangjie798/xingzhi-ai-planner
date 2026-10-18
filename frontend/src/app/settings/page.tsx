"use client";

import { ArrowLeft, CheckCircle, Compass, GearSix, Plugs, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MODEL_PRESETS, readModelConfig, saveModelConfig } from "@/lib/model-config";
import type { ModelConfig } from "@/lib/types";

interface TestState {
  status: "idle" | "testing" | "ok" | "error";
  message: string;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [test, setTest] = useState<TestState>({ status: "idle", message: "" });
  const [savedAt, setSavedAt] = useState<string>("");

  useEffect(() => {
    queueMicrotask(() => setConfig(readModelConfig()));
  }, []);

  if (!config) {
    return <main className="subpage-shell"><section className="subpage-body"><p className="hourly-loading">加载配置中…</p></section></main>;
  }

  const preset = MODEL_PRESETS.find((item) => item.id === config.providerId) ?? MODEL_PRESETS[3];

  const applyPreset = (presetId: string) => {
    const next = MODEL_PRESETS.find((item) => item.id === presetId) ?? MODEL_PRESETS[3];
    setConfig((current) => current && ({
      ...current,
      providerId: next.id,
      providerLabel: next.label,
      baseUrl: next.baseUrl || current.baseUrl,
      model: next.model || current.model,
    }));
    setTest({ status: "idle", message: "" });
  };

  const update = (patch: Partial<ModelConfig>) => {
    setConfig((current) => current && ({ ...current, ...patch }));
    setTest({ status: "idle", message: "" });
  };

  const save = () => {
    saveModelConfig(config);
    setSavedAt(new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
  };

  const testConnection = async () => {
    saveModelConfig(config);
    setTest({ status: "testing", message: "正在连接模型…" });
    const startedAt = Date.now();
    try {
      const response = await fetch("/model-gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: "你是连通性测试助手。", prompt: "请只回复两个字母：OK", config: { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model } }),
      });
      const body = await response.json() as { text?: string; provider?: string; model?: string; detail?: string };
      if (!response.ok || !body.text) throw new Error(body.detail || `服务返回 ${response.status}`);
      const latency = Date.now() - startedAt;
      setTest({ status: "ok", message: `连接成功（${latency}ms）· ${body.provider ?? ""} · ${body.model ?? ""} · 回复：${body.text.slice(0, 40)}` });
    } catch (error) {
      setTest({ status: "error", message: error instanceof Error ? error.message : "连接失败" });
    }
  };

  return (
    <main className="subpage-shell">
      <header className="subpage-topbar">
        <Link href="/dashboard" className="subpage-back"><ArrowLeft size={16} /> 返回工作台</Link>
        <div className="subpage-brand"><Compass size={20} weight="duotone" /><strong>适候 · AI 模型配置</strong></div>
        <div />
      </header>

      <section className="subpage-body settings-body">
        <div className="subpage-heading">
          <div>
            <span className="section-kicker">大模型接口</span>
            <h1>配置你的 AI 模型</h1>
          </div>
          <p className="settings-lede">
            系统默认已接入免费开源大模型（Pollinations 托管的 Mistral，无需密钥）。
            你也可以改用自己的模型服务，旅游路线规划与文字解释将使用你配置的模型。
          </p>
        </div>

        <div className="settings-card">
          <label className="field-label" htmlFor="preset">服务商预设</label>
          <div className="select-wrap"><Plugs size={17} />
            <select id="preset" value={config.providerId} onChange={(event) => applyPreset(event.target.value)}>
              {MODEL_PRESETS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select>
          </div>
          <p className="settings-note">{preset.note}</p>

          <label className="field-label" htmlFor="baseurl">模型地址（Base URL）</label>
          <div className="input-wrap"><GearSix size={17} />
            <input id="baseurl" placeholder="例如 https://api.siliconflow.cn/v1" value={config.baseUrl} onChange={(event) => update({ baseUrl: event.target.value })} />
          </div>

          <label className="field-label" htmlFor="apikey">API 密钥（可留空）</label>
          <div className="input-wrap"><GearSix size={17} />
            <input id="apikey" type="password" placeholder="sk-…" value={config.apiKey} onChange={(event) => update({ apiKey: event.target.value })} />
          </div>

          <label className="field-label" htmlFor="model">模型名称</label>
          <div className="input-wrap"><GearSix size={17} />
            <input id="model" placeholder="例如 Qwen/Qwen2.5-7B-Instruct" value={config.model} onChange={(event) => update({ model: event.target.value })} />
          </div>

          <p className="settings-note">
            兼容 OpenAI chat/completions 协议（vLLM、Ollama、OneAPI、硅基流动、DeepSeek 等均可）。
            密钥仅保存在本机浏览器 localStorage，请求经本站服务端转发，不会写入数据库。
          </p>

          <div className="settings-actions">
            <button type="button" className="analyze-button settings-save" onClick={save}>保存配置{savedAt ? `（${savedAt} 已保存）` : ""}</button>
            <button type="button" className="welcome-ghost" onClick={testConnection} disabled={test.status === "testing"}>
              {test.status === "testing" ? <span className="button-loader dark" /> : <CheckCircle size={17} />} 测试连接
            </button>
          </div>

          {test.status === "ok" && <div className="error-notice ok"><CheckCircle size={17} /><span>{test.message}</span></div>}
          {test.status === "error" && <div className="error-notice" role="alert"><WarningCircle size={17} /><span>{test.message}</span></div>}
        </div>
      </section>
    </main>
  );
}
