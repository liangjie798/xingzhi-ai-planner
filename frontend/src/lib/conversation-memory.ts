/**
 * 对话记忆（档位记忆）：
 * 1. 从整段历史中回捞条件，避免用户上一轮说过、下一轮又被追问；
 * 2. 识别上一轮已经问过哪些字段；
 * 3. 对已问过且非关键的字段使用常规默认值，不再重复追问；
 * 4. 生成「已记住」摘要供界面展示。
 */
import { completeIntake, extractIntake, cleanIntake, type IntakePatch } from "./conversation-intake.ts";

export interface MemoryPolicyResult {
  intake: ReturnType<typeof completeIntake>;
  known: IntakePatch;
  defaultsApplied: string[];
  factsFromHistory: string[];
  memoryLabel: string;
}

const FIELD_QUESTIONS: Array<[field: string, label: string, pattern: RegExp]> = [
  ["activityType", "活动类型", /什么活动|哪种活动|活动类型|准备开展什么/],
  ["cityName", "城市", /哪个城市|哪个区县|目的地|活动在哪个/],
  ["date", "日期", /哪天|日期|什么时候出发|哪一天/],
  ["tripDays", "玩几天", /玩几天|几天|行程长度/],
  ["duration", "时长", /持续几小时|每次活动持续|活动时长/],
  ["participants", "人数", /几个人|多少人|大约几个人/],
  ["group", "人群", /同行|参与者是|人群/],
  ["intensity", "强度", /强度是?[低中高]|活动强度/],
  ["startHour", "时段", /上午、下午或晚上|偏好上午|时段/],
];
const FIELD_LABELS = new Map(FIELD_QUESTIONS.map(([field, label]) => [field, label]));

/** 找出助手上一轮追问了哪些条件字段。 */
export function askedFieldsFromAssistant(text: string): string[] {
  if (!text) return [];
  return FIELD_QUESTIONS.filter(([, , pattern]) => pattern.test(text)).map(([field]) => field);
}

/** 从全部历史用户消息中回捞条件；用于补足服务端快照里遗漏的槽位。 */
export function mergeHistoryFacts(history: Array<{ role: string; content: string }>, today: string, known: IntakePatch): { known: IntakePatch; facts: string[] } {
  let merged = cleanIntake(known);
  const facts: string[] = [];
  for (const message of history) {
    if (message.role !== "user" || !message.content) continue;
    const patch = extractIntake(message.content, today, merged);
    const next = cleanIntake({ ...merged, ...patch });
    for (const [key, value] of Object.entries(next)) {
      if (JSON.stringify(merged[key as keyof IntakePatch]) !== JSON.stringify(value)) facts.push(`${key}=${String(value)}`);
    }
    merged = next;
  }
  // 历史里若出现“杭州 · 2026-11-14 天气预报”，说明用户已经确认过城市和日期。
  for (const message of history) {
    if (message.role !== "assistant" || !message.content) continue;
    const heading = message.content.match(/^([\u4e00-\u9fa5]{2,20})\s*·\s*(\d{4}-\d{2}-\d{2})\s*天气预报/);
    if (heading) {
      if (!merged.cityName) { merged = { ...merged, cityName: heading[1] }; facts.push(`cityName=${heading[1]}`); }
      if (!merged.date) { merged = { ...merged, date: heading[2] }; facts.push(`date=${heading[2]}`); }
    }
  }
  return { known: merged, facts: [...new Set(facts)] };
}

function defaultGroup(known: IntakePatch): IntakePatch["group"] {
  const text = known.audienceDescription || "";
  if (/儿童|学生|亲子|青少年/.test(text)) return "儿童青少年";
  if (/老年/.test(text)) return "老年人";
  if (/敏感/.test(text)) return "敏感人群";
  if (/旅游|外来/.test(known.activityType || "")) return "外来旅游人群";
  return "普通人群";
}

/**
 * 追问去重：上一轮已经问过、用户这轮仍没回答的字段，
 * 非关键项直接采用常规默认值；关键项（城市/日期/活动类型）保留但只问缺失项。
 */
export function applyMemoryPolicy(known: IntakePatch, history: Array<{ role: string; content: string }>, today: string): MemoryPolicyResult {
  const merged = mergeHistoryFacts(history, today, known);
  const current = merged.known;
  const previousAssistant = [...history].reverse().find((message) => message.role === "assistant")?.content || "";
  const asked = askedFieldsFromAssistant(previousAssistant);
  const defaults: IntakePatch = {};
  const defaultsApplied: string[] = [];
  const tourism = current.activityType === "旅游规划";
  const applyDefault = (field: keyof IntakePatch, value: IntakePatch[keyof IntakePatch]) => {
    if (current[field] !== undefined) return;
    (defaults as Record<string, unknown>)[field] = value;
    defaultsApplied.push(FIELD_LABELS.get(String(field)) || String(field));
  };
  if (asked.includes("group")) applyDefault("group", defaultGroup(current));
  if (asked.includes("intensity") && !tourism) applyDefault("intensity", "低强度");
  if (asked.includes("startHour") && !tourism) applyDefault("startHour", 9);
  if (asked.includes("duration") && !tourism) applyDefault("duration", 2);
  // 用户已经看到过一次追问仍没补充：旅游按 1 人、2 天，活动按 20 人处理，不再重复追问同一项。
  if (asked.includes("participants")) applyDefault("participants", tourism ? 1 : 20);
  if (asked.includes("tripDays") && tourism) applyDefault("tripDays", 2);
  const state = completeIntake(current, defaults, today);
  return { intake: state, known: state.intake.known, defaultsApplied, factsFromHistory: merged.facts, memoryLabel: memoryLabel(state.intake.known) };
}

export function memoryLabel(known: IntakePatch | undefined): string {
  if (!known) return "";
  const parts: string[] = [];
  if (known.cityName) parts.push(`城市 ${known.cityName}`);
  if (known.date) parts.push(`日期 ${known.date}${known.endDate && known.endDate !== known.date ? ` 至 ${known.endDate}` : ""}`);
  if (known.activityType) parts.push(known.activityType);
  if (known.participants) parts.push(`${known.participants} 人`);
  if (known.group) parts.push(known.group);
  if (known.tripDays) parts.push(`${known.tripDays} 天`);
  return parts.join(" · ");
}

/** 去掉助手回复里与已知条件重复的追问（例如已经确认城市还在问城市）。 */
export function stripKnownQuestions(reply: string, known: IntakePatch): string {
  if (!reply) return reply;
  const lines = reply.split("\n");
  const filtered = lines.filter((line) => {
    if (!/[？?]/.test(line) || !/^\s*\d+[.、]/.test(line)) return true;
    if (known.cityName && /哪个城市|哪个区县/.test(line)) return false;
    if (known.date && /哪天|日期|哪一天/.test(line)) return false;
    if (known.activityType && /什么活动|哪种活动|活动类型/.test(line)) return false;
    if (known.participants && /几个人|多少人/.test(line)) return false;
    if (known.tripDays && /玩几天|几天/.test(line)) return false;
    return true;
  });
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n");
}
