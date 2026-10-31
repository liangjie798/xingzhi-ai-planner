import { addDays, calendarDateFromText, relativeDateFromText } from "./conversation-intake.ts";
export interface WeatherChartSpec { kind: "weather-comparison"; cityName?: string; dates: string[]; metrics: Array<"temperature" | "rainProbability"> }
interface ChartContext { date?: string; endDate?: string; cityName?: string }
const supportedDate = (date: unknown, today: string): date is string => {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date && date >= today && date <= addDays(today, 6);
};
const safeCity = (city: unknown): string | undefined => typeof city === "string" && !/明天|后天|今天|下周|这里|那里|当地|画|绘|气温|降雨/.test(city) && /^[\u4e00-\u9fa5A-Za-z·\s]{2,40}$/.test(city.trim()) ? city.trim() : undefined;
/** Chart edits have their own city/date state and never change activity conditions. */
export function weatherChartRequest(message: string, known: ChartContext, today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }), previous?: WeatherChartSpec): WeatherChartSpec | null {
  if (!/图|画|绘|可视化|对比|比较/.test(message) && !(previous && /只看|仅看/.test(message)) || !/天气|气温|温度|降雨|降水/.test(message) && !previous) return null;
  const metrics: WeatherChartSpec["metrics"] = [];
  if (/气温|温度/.test(message)) metrics.push("temperature");
  if (/降雨|降水/.test(message)) metrics.push("rainProbability");
  const dates: string[] = [];
  const tokens = message.match(/20\d{2}[-/年]\d{1,2}[-/月]\d{1,2}[日号]?|\d{1,2}月\d{1,2}[日号]?|\d{1,2}[-/]\d{1,2}[日号]?|(?:\d+|[一二两三四五六七八九十]+)(?:天|个?周|个?星期)(?:以|之)?后|大后天|后天|明天|今天|下周|\d{1,2}[日号]/g) || [];
  for (const token of tokens) {
    const date = relativeDateFromText(token, today) || calendarDateFromText(token, today).date;
    if (supportedDate(date, today) && !dates.includes(date)) dates.push(date);
  }
  if (!dates.length && previous) dates.push(...previous.dates.filter(date => supportedDate(date, today)));
  if (!dates.length && supportedDate(known.date, today)) {
    const end = supportedDate(known.endDate, today) ? known.endDate : (/两天|两日/.test(message) ? addDays(known.date, 1) : known.date);
    for (let day = known.date; day <= end && day <= addDays(today, 6) && dates.length < 7; day = addDays(day, 1)) dates.push(day);
  }
  if (dates.length === 1 && /两天|两日/.test(message) && supportedDate(addDays(dates[0], 1), today)) dates.push(addDays(dates[0], 1));
  if (!dates.length) return null;
  const common = message.match(/北京|上海|广州|深圳|杭州|成都|武汉|南京|西安|重庆|天津/);
  const explicit = message.match(/(?:改画|改为|换成|绘制|画)\s*([\u4e00-\u9fa5]{2,12}?)(?:市|县|区)?的(?:气温|温度|降雨|降水)/);
  const cityName = common ? common[0] + "市" : safeCity(explicit?.[1]) || safeCity(previous?.cityName) || safeCity(known.cityName);
  const previousMetrics = previous?.metrics.filter(metric => metric === "temperature" || metric === "rainProbability") || [];
  return { kind: "weather-comparison", cityName, dates: dates.slice(0, 7), metrics: metrics.length ? metrics : previousMetrics.length ? previousMetrics : /天气/.test(message) ? ["temperature", "rainProbability"] : ["temperature"] };
}
