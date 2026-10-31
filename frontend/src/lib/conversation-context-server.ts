import { promptContext, restoreContext, type ConversationContext } from "./conversation-context.ts";

export interface ConversationSnapshotData {
  [key: string]: unknown;
  messages?: unknown; conversationContext?: unknown;
}
export class ConversationStoreError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function endpoint(id: string) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new ConversationStoreError(400, "对话编号格式不正确");
  return `${(process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8080").replace(/\/$/, "")}/api/v1/conversation-sessions/${id}`;
}
function headers(request: Request) {
  const cookie = request.headers.get("cookie");
  if (!cookie) throw new ConversationStoreError(401, "请先建立用户或访客会话，再使用独立对话记忆");
  return { cookie, "Content-Type": "application/json", "X-XSRF-TOKEN": request.headers.get("X-XSRF-TOKEN") || "" };
}
export async function loadConversation(request: Request, id: string): Promise<ConversationSnapshotData> {
  const response = await fetch(endpoint(id), { headers: headers(request), cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new ConversationStoreError(response.status, response.status === 404 ? "当前账户或访客会话无权访问此对话，请重新加载" : "对话记忆读取失败，请重试");
  return response.json();
}
export async function saveConversationContext(request: Request, id: string, snapshot: ConversationSnapshotData) {
  const revision = Number((snapshot.conversationContext as ConversationContext).revision) - 1;
  const response = await fetch(endpoint(id), { method: "PUT", headers: { ...headers(request), "X-Expected-Conversation-Revision": String(revision) }, body: JSON.stringify(snapshot), cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new ConversationStoreError(response.status, response.status === 409 ? "此对话已有较新记录，请刷新后继续，未覆盖新记忆" : "对话记忆保存失败，本次未确认保存，请重试");
}
export async function loadPromptContext(request: Request, id?: string) {
  if (!id) return undefined;
  const snapshot = await loadConversation(request, id);
  return promptContext(restoreContext(snapshot.conversationContext, snapshot.messages), { planning: snapshot.intake, weather: snapshot.weatherContext, destination: snapshot.knowledgeContext, chart: snapshot.weatherComparison });
}
export function snapshotContext(snapshot: ConversationSnapshotData): ConversationContext {
  return restoreContext(snapshot.conversationContext, snapshot.messages);
}
