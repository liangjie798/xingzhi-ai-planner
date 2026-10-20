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

async function csrf(): Promise<CsrfResponse> {
  const response = await fetch("/api/v1/auth/csrf", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("无法建立安全会话");
  return response.json() as Promise<CsrfResponse>;
}

export async function login(username: string, password: string): Promise<AccountUser> {
  const token = await csrf();
  const response = await fetch("/api/v1/auth/login", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", [token.headerName]: token.token },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail || "用户名或密码错误");
  }
  return response.json() as Promise<AccountUser>;
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
