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

export async function csrf(): Promise<CsrfResponse> {
  const response = await fetch("/api/v1/auth/csrf", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("无法建立安全会话");
  return response.json() as Promise<CsrfResponse>;
}

export async function login(username: string, password: string, portal: "USER" | "ADMIN" = "USER"): Promise<AccountUser> {
  const token = await csrf();
  const response = await fetch("/api/v1/auth/login", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", [token.headerName]: token.token },
    body: JSON.stringify({ username, password, portal }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail || "用户名或密码错误");
  }
  return response.json() as Promise<AccountUser>;
}

export async function register(username: string, password: string, displayName: string): Promise<AccountUser> {
  const token = await csrf();
  const response = await fetch("/api/v1/auth/register", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", [token.headerName]: token.token }, body: JSON.stringify({ username, password, displayName }) });
  const body = await response.json().catch(() => null) as (AccountUser & { detail?: string }) | null;
  if (!response.ok) throw new Error(body?.detail || "注册失败，请检查用户名和密码");
  return body as AccountUser;
}

export async function loginAsGuest(): Promise<AccountUser> {
  const token = await csrf();
  const response = await fetch("/api/v1/auth/guest", { method: "POST", credentials: "same-origin", headers: { [token.headerName]: token.token } });
  if (!response.ok) throw new Error("访客会话建立失败");
  return response.json() as Promise<AccountUser>;
}

export interface AdminOverview { registeredUsers: number; searches: number; decisions: number }
export interface AdminUser { id: number; username: string; displayName: string; role: string; enabled: boolean; createdAt: string }
export interface AdminSearch { id: number; query: string; resultCount: number; username?: string; actorType: string; createdAt: string }
export interface UserFeedback { id: number; username: string; actorType: string; title: string; content: string; status: "OPEN" | "IN_PROGRESS" | "RESOLVED"; adminReply?: string; createdAt: string; updatedAt: string }

export async function authenticatedRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const token = method === "GET" ? null : await csrf();
  const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", ...(token ? { [token.headerName]: token.token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(error?.detail || `请求失败（${response.status}）`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
export async function adminData(): Promise<[AdminOverview, AdminUser[], AdminSearch[]]> {
  const responses = await Promise.all(["overview", "users", "searches"].map((path) => fetch(`/api/v1/admin/${path}`, { credentials: "same-origin", cache: "no-store" })));
  if (responses.some((response) => !response.ok)) throw new Error("无管理员权限或数据加载失败");
  return Promise.all(responses.map((response) => response.json())) as Promise<[AdminOverview, AdminUser[], AdminSearch[]]>;
}

export async function currentUser(): Promise<AccountUser | null> {
  const response = await fetch("/api/v1/auth/me", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) return null;
  const text = await response.text();
  return text ? JSON.parse(text) as AccountUser : null;
}

export async function logout(): Promise<void> {
  const token = await csrf();
  await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin", headers: { [token.headerName]: token.token } });
}

export async function decisionHistory(): Promise<DecisionHistoryItem[]> {
  const response = await fetch("/api/v1/account/decisions", { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401 || response.status === 403) throw new Error("请先登录");
  if (!response.ok) throw new Error("决策记录加载失败");
  return response.json() as Promise<DecisionHistoryItem[]>;
}
