const snapshotVersions = new Map<string, number>();
export function acceptConversationVersion(id: string, version?: number) { if (typeof version === "number") snapshotVersions.set(id, version); }
export interface AccountUser {
  username: string;
  displayName: string;
  role: string;
}

export interface DecisionHistoryItem {
  id: number;
  cityId: string;
  activityType: string;
  overallScore: number;
  overallLevel: string;
  generatedBy: string;
  summary: string;
  createdAt: string;
}

interface CsrfResponse { headerName: string; token: string }

/** 页面离开时可中止请求，与超时信号合并；不支持 AbortSignal.any 的浏览器退回纯超时。 */
function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  if (!signal) return AbortSignal.timeout(timeoutMs);
  return typeof AbortSignal.any === "function" ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
}

export async function csrf(): Promise<CsrfResponse> {
  let response: Response;
  try {
    response = await fetch("/api/v1/auth/csrf", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error("无法连接登录服务，请检查网络及后端服务是否已启动，然后重试。");
  }
  if (response.status === 404) throw new Error("登录服务接口未找到，请检查后端服务是否已启动，以及代理端口是否配置正确。");
  if (response.status >= 500) throw new Error("登录服务暂不可用，请确认后端服务正常运行后重试。");
  if (!response.ok) throw new Error("无法建立安全会话，请刷新页面后重试。");
  const token = await response.json().catch(() => null) as Partial<CsrfResponse> | null;
  if (!token || typeof token.headerName !== "string" || !/^[A-Za-z0-9-]+$/.test(token.headerName) || typeof token.token !== "string" || !token.token.trim() || /[\r\n]/.test(token.token)) {
    throw new Error("登录服务返回了无效的会话信息，请检查后端地址和代理配置。");
  }
  return { headerName: token.headerName, token: token.token };
}

export async function login(username: string, password: string, portal: "USER" | "ADMIN" = "USER", signal?: AbortSignal): Promise<AccountUser> {
  const token = await csrf();
  let response: Response;
  try {
    response = await fetch("/api/v1/auth/login", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", [token.headerName]: token.token },
      body: JSON.stringify({ username, password, portal }),
      signal: requestSignal(signal, 15_000),
    });
  } catch {
    throw new Error("登录请求超时或网络异常，请重试。");
  }
  if (response.status === 429) throw new Error("尝试过于频繁，请稍后再试。");
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail || "用户名或密码错误");
  }
  return response.json() as Promise<AccountUser>;
}

export async function register(username: string, password: string, displayName: string, signal?: AbortSignal): Promise<AccountUser> {
  const token = await csrf();
  let response: Response;
  try {
    response = await fetch("/api/v1/auth/register", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", [token.headerName]: token.token }, body: JSON.stringify({ username, password, displayName }), signal: requestSignal(signal, 15_000) });
  } catch {
    throw new Error("注册请求超时或网络异常，请重试。");
  }
  const body = await response.json().catch(() => null) as (AccountUser & { detail?: string }) | null;
  if (response.status === 429) throw new Error("注册过于频繁，请稍后再试。");
  if (!response.ok) throw new Error(body?.detail || "注册失败，请检查用户名和密码");
  return body as AccountUser;
}

export async function loginAsGuest(signal?: AbortSignal): Promise<AccountUser> {
  const token = await csrf();
  let response: Response;
  try {
    response = await fetch("/api/v1/auth/guest", { method: "POST", credentials: "same-origin", headers: { [token.headerName]: token.token }, signal: requestSignal(signal, 15_000) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("访客会话建立超时，请检查网络后重试。");
  }
  if (response.status === 429) throw new Error("尝试过于频繁，请稍后再试。");
  if (!response.ok) throw new Error("访客会话建立失败，请重试。");
  return response.json() as Promise<AccountUser>;
}

export interface AdminOverview { registeredUsers: number; searches: number; decisions: number }
export interface AdminUser { id: number; username: string; displayName: string; role: string; enabled: boolean; createdAt: string }
export interface AdminSearch { id: number; query: string; resultCount: number; username?: string; actorType: string; createdAt: string }
export interface UserFeedback { id: number; username: string; actorType: string; title: string; content: string; status: "OPEN" | "IN_PROGRESS" | "RESOLVED"; adminReply?: string; createdAt: string; updatedAt: string }

export async function authenticatedRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const conversationId = path.match(/^\/api\/v1\/conversation-sessions\/([a-zA-Z0-9-]+)$/)?.[1];
  if (conversationId && method === "PUT") body = { ...(body as object), snapshotVersion: snapshotVersions.get(conversationId) ?? 0 };
  const token = method === "GET" ? null : await csrf();
  let response: Response;
  try {
    response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", ...(token ? { [token.headerName]: token.token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error("请求超时或网络异常，请重试。");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(error?.detail || `请求失败（${response.status}）`);
  }
  const text = await response.text();
  const result = text ? JSON.parse(text) : undefined;
  if (conversationId) acceptConversationVersion(conversationId, result?.snapshotVersion ?? (method === "GET" ? 0 : undefined));
  return result as T;
}
export async function adminData(): Promise<[AdminOverview, AdminUser[], AdminSearch[]]> {
  const responses = await Promise.all(["overview", "users", "searches"].map((path) => fetch(`/api/v1/admin/${path}`, { credentials: "same-origin", cache: "no-store" })));
  if (responses.some((response) => !response.ok)) throw new Error("无管理员权限或数据加载失败");
  return Promise.all(responses.map((response) => response.json())) as Promise<[AdminOverview, AdminUser[], AdminSearch[]]>;
}

export async function currentUser(): Promise<AccountUser | null> {
  let response: Response;
  try {
    response = await fetch("/api/v1/auth/me", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8_000) });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const text = await response.text();
  return text ? JSON.parse(text) as AccountUser : null;
}

export async function logout(): Promise<void> {
  const token = await csrf();
  try {
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin", headers: { [token.headerName]: token.token }, signal: AbortSignal.timeout(10_000) });
  } catch { /* 页面仍按本地登出处理 */ }
}

export async function decisionHistory(): Promise<DecisionHistoryItem[]> {
  const response = await fetch("/api/v1/account/decisions", { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401 || response.status === 403) throw new Error("请先登录");
  if (!response.ok) throw new Error("决策记录加载失败");
  return response.json() as Promise<DecisionHistoryItem[]>;
}
