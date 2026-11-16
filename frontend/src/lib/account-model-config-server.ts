import type { ClientModelConfig } from "./llm-server";

interface StoredConfig extends ClientModelConfig { configured?: boolean }

export async function readResolvedModelConfig(request: Request): Promise<StoredConfig | undefined> {
  const cookie = request.headers.get("cookie");
  if (cookie) {
    try {
      const backend = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8080";
      const resolverSecret = process.env.MODEL_CONFIG_SECRET || "local-development-model-config-secret";
      const response = await fetch(`${backend.replace(/\/$/, "")}/api/v1/account/model-config/resolve`, {
        headers: { cookie, "X-Model-Resolver-Secret": resolverSecret }, cache: "no-store", signal: AbortSignal.timeout(3500),
      });
      if (response.ok) {
        return await response.json() as StoredConfig;
      }
    } catch { /* use server defaults */ }
  }
  return undefined;
}

export async function resolveAccountModelConfig(request: Request): Promise<ClientModelConfig | undefined> {
  const stored = await readResolvedModelConfig(request);
  if (stored?.configured && stored.baseUrl && stored.model) {
    return { baseUrl: stored.baseUrl, apiKey: stored.apiKey || "", model: stored.model };
  }
}
