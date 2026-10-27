import { addDays, calendarDateFromText, relativeDateFromText } from "./conversation-intake.ts";
export interface WeatherChartSpec { kind: "weather-comparison"; cityName?: string; dates: string[]; metrics: Array<"temperature" | "rainProbability"> }
interface ChartContext { date?: string; endDate?: string; cityName?: string }
/** Chart edits have their own city/date state and never change activity conditions. */
export function weatherChartRequest(message: string, known: ChartContext, today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }), previous?: WeatherChartSpec): WeatherChartSpec | null {
  if (!/图|画|绘|可视化|对比|比较/.test(message) || !/气温|温度|降雨|降水/.test(message) && !previous) return null;
  const metrics: WeatherChartSpec["metrics"] = [];
  if (/气温|温度/.test(message)) metrics.push("temperature");
  if (/降雨|降水/.test(message)) metrics.push("rainProbability");
  const dates: string[] = [];
  const tokens = message.match(/20\d{2}[-/年]\d{1,2}[-/月]\d{1,2}[日号]?|\d{1,2}月\d{1,2}[日号]?|\d{1,2}[-/]\d{1,2}[日号]?|(?:\d+|[一二两三四五六七八九十]+)(?:天|个?周|个?星期)(?:以|之)?后|大后天|后天|明天|今天|下周|\d{1,2}[日号]/g) || [];
  for (const token of tokens) {
    const date = relativeDateFromText(token, today) || calendarDateFromText(token, today).date;
    if (date && !dates.includes(date)) dates.push(date);
  }
  if (!dates.length && previous) dates.push(...previous.dates);
  if (!dates.length && known.date) {
    const end = known.endDate || (/两天|两日/.test(message) ? addDays(known.date, 1) : known.date);
    for (let day = known.date; day <= end && dates.length < 7; day = addDays(day, 1)) dates.push(day);
  }
  if (dates.length === 1 && /两天|两日/.test(message)) dates.push(addDays(dates[0], 1));
  if (!dates.length) return null;
  const common = message.match(/北京|上海|广州|深圳|杭州|成都|武汉|南京|西安|重庆|天津/);
  const explicit = message.match(/(?:改画|改为|换成|绘制|画)\s*([\u4e00-\u9fa5]{2,12}?)(?:市|县|区)?的(?:气温|温度|降雨|降水)/);
  const cityName = common ? common[0] + "市" : explicit?.[1] || previous?.cityName || known.cityName;
  return { kind: "weather-comparison", cityName, dates: dates.slice(0, 7), metrics: metrics.length ? metrics : previous?.metrics || ["temperature"] };
}
