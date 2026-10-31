import { calendarDateFromText, cleanIntake, completeIntake, extractIntake, parseConversationNumber, type IntakePatch } from "./conversation-intake.ts";

interface InputIssue { fields: Array<keyof IntakePatch>; reply: string }

function durationNumber(token: string): number {
  const normalized = token.replace(/[负−]/, "-");
  const unsigned = normalized.replace(/^-/, "");
  if (/^\d/.test(unsigned)) return Number(normalized);
  const [whole, fraction] = unsigned.split("点");
  const value = parseConversationNumber(whole) + (fraction ? Number(`0.${[...fraction].map(digit => parseConversationNumber(digit)).join("")}`) : 0);
  return normalized.startsWith("-") ? -value : value;
}

/** Validate before cleaning: an invalid edit must never mean "keep the old value". */
export function conversationInputIssues(message: string, today: string): InputIssue[] {
  const issues: InputIssue[] = [];
  for (const token of message.match(/20\d{2}[-/年]\d{1,2}[-/月]\d{1,2}[日号]?|\d{1,2}月\d{1,2}[日号]?|\d{1,2}[-/]\d{1,2}[日号]?|[零〇一二两三四五六七八九十\d]+月[零〇一二两三四五六七八九十\d]+[日号]?|\d{1,2}[日号]/g) || [message]) {
    const calendar = calendarDateFromText(token, today);
    if (calendar.error) issues.push({ fields: ["date", "endDate", "departureDate"], reply: calendar.error });
  }
  const people = message.match(/(?:人数|参与人数)?\s*(?:改成|改为|调整为|为|是|：|:)?\s*([负−-]?\d+(?:\.\d+)?|零)\s*(?:个|位|名)?\s*(?:大学生|研究生|成年人|成人|初中生|高中生|小学生|学生|同学|小朋友|孩子|老人|老年人|人|位|名)/);
  const peopleValue = people ? (people[1] === "零" ? 0 : Number(people[1].replace(/[负−]/, "-"))) : undefined;
  if (peopleValue !== undefined && (!Number.isInteger(peopleValue) || peopleValue < 1 || peopleValue > 9999)) issues.push({ fields: ["participants"], reply: "人数必须为1至9999的整数，请修改人数后再分析。本次未重新计算。" });
  for (const duration of message.matchAll(/([负−-]?(?:\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千]+(?:点[零〇一二两三四五六七八九]+)?))\s*个?小时/g)) {
    const value = durationNumber(duration[1]);
    if (!Number.isInteger(value) || value < 1 || value > 8) issues.push({ fields: ["duration"], reply: `已识别时长为${value}小时（${Math.round(value * 60)}分钟）。当前排程只支持1至8个整小时，请选择整小时时长；本次未重新计算。` });
  }
  const equipment = message.match(/(?:器材|装备)(?:数量)?\s*(?:改成|改为|调整为|为|是|有|共|：|:)?\s*([负−-]?\d+(?:\.\d+)?|零)\s*(?:个|套|副|件)?|([负−-]?\d+(?:\.\d+)?|零)\s*(?:个|套|副|件)?\s*(?:篮球|足球|球拍|器材|装备)/);
  const equipmentToken = equipment?.[1] || equipment?.[2];
  const equipmentValue = equipmentToken ? (equipmentToken === "零" ? 0 : Number(equipmentToken.replace(/[负−]/, "-"))) : undefined;
  if (equipmentValue !== undefined && (!Number.isInteger(equipmentValue) || equipmentValue < 1 || equipmentValue > 100000)) issues.push({ fields: ["equipmentCount"], reply: "器材数量必须为1至100000的整数，请修改数量后再分析。本次未重新计算。" });
  return issues;
}

export function conversationInputError(message: string, today: string): string | undefined {
  return conversationInputIssues(message, today)[0]?.reply;
}

/** Save independent valid facts even when another field needs correction. Never analyze here. */
export function retainValidConversationInput(message: string, today: string, previous: IntakePatch) {
  const issues = conversationInputIssues(message, today);
  const delta = extractIntake(message, today, previous);
  for (const issue of issues) for (const field of issue.fields) delete delta[field];
  const known = completeIntake(previous, delta, today).intake.known;
  const saved = [known.cityName, known.date && `${known.date}出发/开展`, known.tripDays && `${known.tripDays}天`, known.participants && `${known.participants}人`, known.audienceDescription].filter(Boolean);
  const reply = `${issues.map(issue => issue.reply).join("\n")}\n${saved.length ? `已保留：${saved.join("，")}。` : "之前已确认的条件已保留。"}其余有效条件不变，请只补充需要修正的部分。`;
  return { known, reply, issues };
}

/** Recover facts discarded by the old whole-message rejection, without overriding newer choices. */
export function recoverRejectedIntake(history: Array<{ role: string; content: string }>, today: string, previous: IntakePatch): IntakePatch {
  let recovered: IntakePatch = {};
  for (let index = 0; index < history.length - 1; index++) {
    const item = history[index], answer = history[index + 1];
    if (item.role !== "user" || answer.role !== "assistant" || !/本次未重新计算/.test(answer.content) || !conversationInputError(item.content, today)) continue;
    recovered = retainValidConversationInput(item.content, today, recovered).known;
  }
  if (!Object.keys(recovered).length) return cleanIntake(previous);
  // Recompute derived dates after merging so an old rejected trip length cannot undo a later edit.
  return completeIntake(recovered, cleanIntake(previous), today).intake.known;
}

export const isCourtesy = (text: string) => /^(?:谢谢(?:你|您)?|多谢|感谢(?:你|您)?|好的|好哒|收到|明白了|辛苦了)[！!。~～\s]*$/.test(text);
export const isModelQuestion = (text: string) => /(?:你|当前|接入|使用|调用).*(?:什么|哪个|哪种|哪个版本|的).*(?:模型|AI)|你是谁|测试.*模型|模型.*(?:测试|验证|名称)/i.test(text);
