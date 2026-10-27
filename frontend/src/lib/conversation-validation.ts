import { calendarDateFromText } from "./conversation-intake.ts";

/** Validate before cleaning: an invalid edit must never mean "keep the old value". */
export function conversationInputError(message: string, today: string): string | undefined {
  for (const token of message.match(/20\d{2}[-/年]\d{1,2}[-/月]\d{1,2}[日号]?|\d{1,2}月\d{1,2}[日号]?|\d{1,2}[-/]\d{1,2}[日号]?|[零〇一二两三四五六七八九十\d]+月[零〇一二两三四五六七八九十\d]+[日号]?|\d{1,2}[日号]/g) || [message]) {
    const calendar = calendarDateFromText(token, today);
    if (calendar.error) return calendar.error;
  }
  if (/(?:人数|参与人数)(?:改成|改为|为|是|：|:)?\s*[-−]?0(?:人|[，。\s]|$)|(?:^|[^\d])[-−]?0\s*(?:个|位|名)?人/.test(message)) return "人数必须为1至9999的整数，请修改人数后再分析。本次未重新计算。";
  const people = message.match(/(?:人数(?:改成|改为|为|是|：|:)?\s*)?(-?\d+(?:\.\d+)?)\s*(?:人|名学生|个学生)/);
  if (people && (!Number.isInteger(Number(people[1])) || Number(people[1]) < 1 || Number(people[1]) > 9999)) return "人数必须为1至9999的整数，请修改后再分析。";
  const duration = message.match(/(-?\d+(?:\.\d+)?)\s*个?小时/);
  if (duration && (!Number.isInteger(Number(duration[1])) || Number(duration[1]) < 1 || Number(duration[1]) > 8)) {
    const value = Number(duration[1]);
    return `已识别时长为${value}小时（${Math.round(value * 60)}分钟）。当前排程只支持1至8个整小时，请选择整小时时长；本次未重新计算。`;
  }
  return undefined;
}

export const isCourtesy = (text: string) => /^(?:谢谢(?:你|您)?|多谢|感谢(?:你|您)?|好的|好哒|收到|明白了|辛苦了)[！!。~～\s]*$/.test(text);
export const isModelQuestion = (text: string) => /(?:你|当前|接入|使用|调用).*(?:什么|哪个|哪种|哪个版本|的).*(?:模型|AI)|你是谁|测试.*模型|模型.*(?:测试|验证|名称)/i.test(text);
