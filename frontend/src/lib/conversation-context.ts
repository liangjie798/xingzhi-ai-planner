/** Bounded, extractive conversation memory. All content is data, never system instructions. */
export const CONTEXT_LIMITS = { recentMessages: 24, recentChars: 24000, messageChars: 4000, summaryChars: 3000, facts: 64, factChars: 600 } as const;
export interface ContextMessage { id: string; role: "user" | "assistant"; content: string; kind?: string; sources?: Array<{ title: string; url?: string; detail?: string }> }
export interface RememberedFact { key: string; value: string }
export interface ConversationContext {
  version: 1; revision: number; recent: ContextMessage[]; summary: string;
  summarizedMessages: number; facts: RememberedFact[]; forgottenKeys: string[];
}
export interface PromptContext {
  summary: string; rememberedFacts: RememberedFact[]; recentMessages: Array<{ role: string; content: string }>;
  planning?: unknown; weather?: unknown; destination?: unknown; chart?: unknown;
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const clean = (value: string) => value.trim().replace(/[。！!]+$/, "").slice(0, CONTEXT_LIMITS.factChars);
const keyOf = (text: string) => clean(text).replace(/^(?:请|帮我|本次测试|这次测试|本次|这次|之前的|原来的|现在的|我的|我|一个|本条对话的|测试)+/, "").trim().slice(0, 60);
const credential = /(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+\S+|(?:api[_ -]?key|密码|口令|Cookie|认证令牌)\s*[:：=是为]\s*\S+)/i;
function sourcesOf(raw: unknown): ContextMessage["sources"] {
  return Array.isArray(raw) ? raw.filter(record).filter(row => typeof row.title === "string").slice(0, 8).map(row => ({ title: String(row.title).slice(0, 200), ...(typeof row.url === "string" && /^https:\/\//.test(row.url) ? { url: row.url.slice(0, 1000) } : {}), ...(typeof row.detail === "string" ? { detail: row.detail.slice(0, 500) } : {}) })) : undefined;
}
export function emptyContext(revision = 0): ConversationContext {
  return { version: 1, revision, recent: [], summary: "", summarizedMessages: 0, facts: [], forgottenKeys: [] };
}
export function cleanContext(raw: unknown): ConversationContext {
  const out = emptyContext();
  if (!record(raw)) return out;
  out.revision = Number.isSafeInteger(raw.revision) && Number(raw.revision) >= 0 ? Number(raw.revision) : 0;
  out.summary = typeof raw.summary === "string" ? raw.summary.slice(-CONTEXT_LIMITS.summaryChars) : "";
  out.summarizedMessages = Number.isSafeInteger(raw.summarizedMessages) && Number(raw.summarizedMessages) >= 0 ? Number(raw.summarizedMessages) : 0;
  out.facts = Array.isArray(raw.facts) ? raw.facts.filter(record).filter(f => typeof f.key === "string" && typeof f.value === "string" && !credential.test(f.value)).slice(-CONTEXT_LIMITS.facts).map(f => ({ key: keyOf(String(f.key)), value: clean(String(f.value)) })).filter(f => f.key && f.value) : [];
  out.forgottenKeys = Array.isArray(raw.forgottenKeys) ? raw.forgottenKeys.filter((v): v is string => typeof v === "string").map(keyOf).slice(-64) : [];
  if (Array.isArray(raw.recent)) for (const row of raw.recent.slice(-CONTEXT_LIMITS.recentMessages)) {
    if (record(row) && ["user", "assistant"].includes(String(row.role)) && typeof row.content === "string") out.recent.push({ id: typeof row.id === "string" ? row.id.slice(0, 100) : `legacy-${out.recent.length}`, role: row.role as ContextMessage["role"], content: row.content.slice(0, CONTEXT_LIMITS.messageChars), sources: sourcesOf(row.sources), ...(typeof row.kind === "string" ? { kind: row.kind.slice(0, 80) } : {}) });
  }
  return bound(out);
}
function bound(ctx: ConversationContext) {
  while (ctx.recent.length > CONTEXT_LIMITS.recentMessages || ctx.recent.reduce((n, m) => n + m.content.length, 0) > CONTEXT_LIMITS.recentChars) {
    const older = ctx.recent.shift()!;
    const excerpt = older.content.replace(/\s+/g, " ").slice(0, 180);
    // An extractive summary avoids a model dependency and cannot invent omitted details.
    ctx.summary = `${ctx.summary}\n${older.role === "user" ? "用户曾说" : "助手曾答"}：${excerpt}`.trim().slice(-CONTEXT_LIMITS.summaryChars);
    ctx.summarizedMessages++;
  }
  return ctx;
}
export function appendContextMessage(ctx: ConversationContext, message: ContextMessage): ConversationContext {
  if (!ctx.recent.some(row => row.id === message.id)) ctx.recent.push({ ...message, content: message.content.slice(0, CONTEXT_LIMITS.messageChars) });
  return bound(ctx);
}
function eraseValues(ctx: ConversationContext, values: string[]) {
  for (const value of values.filter(Boolean)) {
    ctx.summary = ctx.summary.split(value).join("[已移除]");
    ctx.recent = ctx.recent.map(row => ({ ...row, content: row.content.split(value).join("[已移除]") }));
  }
}
function matchingFact(ctx: ConversationContext, query: string) {
  const key = keyOf(query.replace(/(?:是什么|是多少|什么|多少|吗|呢|[？?])+/g, ""));
  return ctx.facts.find(f => f.key === key) || ctx.facts.find(f => key && (key.includes(f.key) || f.key.includes(key)));
}
export function applyMemoryIntent(ctx: ConversationContext, message: string): { context: ConversationContext; reply?: string; clear?: boolean; sanitizedMessage?: string } {
  const text = message.trim().replace(/^(?:(?:请|麻烦|帮我|帮忙)[，,\s]*)+/, "");
  if (/^(?:不要|别|不用|无需)(?:再)?(?:记住|更新|修改|更正)/.test(text)) return { context: ctx, reply: "本次未修改已保存事项。" };
  if (/^(?:请)?(?:清空|清除)(?:当前|本次|这条)?(?:对话)?(?:的)?(?:全部)?记忆[。！!？?]*$/.test(text)) return { context: emptyContext(ctx.revision), clear: true, reply: "已清空当前对话的事项、摘要、历史与规划条件。其他独立对话不变。" };
  const forget = text.match(/^(?:请)?(?:帮我)?(?:忘记|删除记忆|移除记忆|不再记住)\s*(.+?)[。！!]*$/);
  if (forget) {
    const all = /^(?:所有|全部)(?:记住的)?(?:事项|内容|信息)?$/.test(forget[1]);
    const exact = ctx.facts.find(f => f.key === keyOf(forget[1]) || f.value === clean(forget[1]));
    const selected = all ? ctx.facts : exact ? [exact] : ctx.facts.filter(f => forget[1].includes(f.key) || forget[1].includes(f.value));
    eraseValues(ctx, selected.map(f => f.value));
    ctx.facts = ctx.facts.filter(f => !selected.includes(f));
    ctx.forgottenKeys = [...new Set([...ctx.forgottenKeys, ...selected.map(f => f.key), ...(selected.length ? [] : [keyOf(forget[1])])])].slice(-64);
    return { context: ctx, sanitizedMessage: `忘记${selected.map(f => f.key).join("、") || keyOf(forget[1])}`, reply: selected.length ? `已忘记${selected.map(f => f.key).join("、")}，后续不再从原文或摘要中召回旧值。` : "当前对话没有找到这项已保存事项；不会推测其内容。" };
  }
  const save = text.match(/^(?:请)?(?:帮我)?(?:记住|记一下|记下|补充记忆|更新记忆)[：:\s]*(.+)$/);
  const assignmentUpdate = text.match(/^(?:(?:更正|纠正|补充)(?:一下)?[，,:：\s]*)?(.{1,60}?)(?:是|为|[:：=])(.+?)[。！!]*$/);
  const updateExisting = assignmentUpdate && ctx.facts.some(f => f.key === keyOf(assignmentUpdate[1])) && !/^(?:什么|多少|哪)|[？?]/.test(assignmentUpdate[2]);
  const change = text.match(/^(?:请)?(?:把)?(.+?)(?:更正为|改成|改为|更新为|现在是)[：:\s]*(.+?)[。！!]*$/) || (updateExisting ? assignmentUpdate : null);
  if (save || change && matchingFact(ctx, change[1])) {
    if (credential.test(text)) return { context: ctx, reply: "请不要保存密码、API密钥或认证信息；本次未将其写入事项记忆。" };
    if ((save?.[1] || change?.[2] || "").length > CONTEXT_LIMITS.factChars) return { context: ctx, reply: "单项记忆最多600字符，请精简或分成独立事项；本次未保存，已有事项保留。" };
    const content = clean(save ? save[1].replace(/^(?:把)?(.{1,60}?)(?:更正为|改成|改为|更新为|现在是)[：:\s]*(.+)$/, "$1是$2") : `${change![1]}是${change![2]}`);
    const assignment = content.match(/^(.{1,60}?)(?:是|为|[:：=])(.+)$/);
    const existing = assignment ? ctx.facts.find(f => f.key === keyOf(assignment[1])) : change ? matchingFact(ctx, change[1]) : undefined;
    const key = existing?.key || (assignment ? keyOf(assignment[1]) : keyOf(content.slice(0, 24)));
    const value = clean(assignment ? assignment[2] : content);
    if (!key || !value) return { context: ctx, reply: "请说明需要记住的具体事项，例如“记住暗号是紫竹海豚739”。" };
    if (!existing && ctx.facts.length >= CONTEXT_LIMITS.facts) return { context: ctx, reply: "当前对话已保存64项事项，请先忘记不需要的事项后再保存；已有事项仍保留。" };
    if (existing) eraseValues(ctx, [existing.value]);
    ctx.facts = ctx.facts.filter(f => f.key !== key);
    ctx.facts.push({ key, value });
    ctx.forgottenKeys = ctx.forgottenKeys.filter(k => k !== key);
    return { context: ctx, sanitizedMessage: existing ? `记住${key}是${value}` : undefined, reply: `已${existing ? "更新" : "记住"}：${key}是${value}。仅保存在当前独立对话中。` };
  }
  if (/^(?:请)?(?:我(?:刚才|上一句|上次|之前|前面)|刚才我)(?:说|提到|讲)(?:了|过)?什么(?:内容)?[？?。]*$/.test(text)) {
    const last = ctx.recent.filter(row => row.role === "user").at(-1);
    return { context: ctx, reply: last ? `你上一条消息是：“${last.content}”。` : "当前对话没有可核对的上一条用户原文，我不能准确复述。" };
  }
  const found = matchingFact(ctx, text);
  if (found && /什么|多少|复述|告诉我|还记得|[？?]/.test(text)) return { context: ctx, reply: `当前对话保存的${found.key}是：${found.value}。` };
  if (/(?:之前|刚才|前面|本次|这次).*(?:暗号|记住|说过|提到)|(?:我|我们)(?:之前|刚才|前面|上次).*(?:说|提)|记住了什么|保存了什么|记忆里|还记得|对话.*(?:暗号|记忆)/.test(text) || /^(?:之前|刚才|前面)(?:的|说的|保存的).*(?:什么|多少|哪|[？?])/.test(text) || /暗号.*(?:是什么|多少|[？?])/.test(text) || ctx.forgottenKeys.some(key => text.includes(key))) {
    if (/记住了什么|保存了什么|记忆里|记住的事项/.test(text)) return { context: ctx, reply: ctx.facts.length ? `当前对话已保存：\n${ctx.facts.map(f => `${f.key}：${f.value}`).join("\n")}` : "当前对话没有已保存的事项。" };
    return { context: ctx, reply: "当前对话没有找到可确认的这项记忆，可能尚未保存或已被忘记；我不会编造，也不会用联网资料替代你的会话信息。" };
  }
  return { context: ctx };
}
/** Migration is only from this owner's loaded snapshot, never a global/process cache. */
export function restoreContext(raw: unknown, messages: unknown): ConversationContext {
  if (record(raw) && raw.version === 1) {
    const ctx = cleanContext(raw);
    if (Array.isArray(messages)) {
      const last = ctx.recent.at(-1);
      const index = last ? messages.findLastIndex(row => record(row) && (row.id === last.id || row.role === last.role && row.content === last.content)) : -1;
      // Only append UI-local turns after the last known message; never replay summarized turns.
      if (!last || index >= 0) for (const [offset, row] of messages.slice(index + 1).entries()) {
        if (record(row) && ["user", "assistant"].includes(String(row.role)) && typeof row.content === "string") appendContextMessage(ctx, { id: typeof row.id === "string" ? row.id : `local-${ctx.revision}-${offset}`, role: row.role as ContextMessage["role"], content: credential.test(row.content) ? "[敏感凭据已省略]" : row.content, sources: sourcesOf(row.sources) });
      }
    }
    return ctx;
  }
  let ctx = emptyContext();
  if (Array.isArray(messages)) for (const [i, row] of messages.slice(-1000).entries()) {
    if (!record(row) || !["user", "assistant"].includes(String(row.role)) || typeof row.content !== "string") continue;
    const action = row.role === "user" ? applyMemoryIntent(ctx, row.content) : undefined;
    if (action) ctx = action.context;
    appendContextMessage(ctx, { id: typeof row.id === "string" ? row.id : `migrated-${i}`, role: row.role as ContextMessage["role"], content: credential.test(row.content) ? "[敏感凭据已省略]" : action?.sanitizedMessage || row.content, sources: sourcesOf(row.sources), ...(typeof row.kind === "string" ? { kind: row.kind.slice(0, 80) } : {}) });
  }
  return ctx;
}
export function promptContext(ctx: ConversationContext, state: Pick<PromptContext, "planning" | "weather" | "destination" | "chart"> = {}): PromptContext {
  const safe = cleanContext(ctx);
  return { summary: safe.summary, rememberedFacts: safe.facts, recentMessages: safe.recent.map(({ role, content }) => ({ role, content })), ...state };
}
export function contextUserMessage(text: string, id: string): ContextMessage {
  return { id, role: "user", content: credential.test(text) ? "[敏感凭据已省略]" : text.slice(0, CONTEXT_LIMITS.messageChars) };
}
