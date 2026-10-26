import type { EnvironmentalForecastPoint } from "./types";

export function weatherPlace(message: string): string | undefined {
  const text = message.replace(/^(?:请|帮我|查一下|查询|告诉我|看看|我想知道|查查|查)+/, "")
    .replace(/(?:20\d{2}[-/年]|今年|明年)?[零〇一二两三四五六七八九十\d]+[-/月][零〇一二两三四五六七八九十\d]+[日号]?|(?:本月|这个月|下个月|下月)?[零〇一二两三四五六七八九十\d]+[日号]/g, "")
    .replace(/(?:再过|过|往后)?[一二两三四五六七八九十\d]+(?:天|个?(?:星期|周))(?:以|之)?后|(?:再过|过)[一二两三四五六七八九十\d]+天/g, "")
    .replace(/大后天|后天|明天|今天|今日|现在|目前/g, "").trim();
  const match = text.match(/^([\u4e00-\u9fa5]{2,10}?)(?:的)?(?:天气|气温|温度|湿度|空气质量|降雨概率|降水概率)/);
  return match && !/^(会不会|会|是否|这里|那里|当地|这个|如何|怎么样|什么)$/.test(match[1]) ? match[1] : undefined;
}

export function weatherDestination(message: string, extracted?: string, previous?: string): string | undefined {
  const named = weatherPlace(message);
  // Preserve explicit districts; otherwise prefer the parser's full city name
  // (e.g. 西安市 rather than the ambiguous keyword 西安).
  return named && /(?:市|县|区)$/.test(named) ? named : extracted || named || previous;
}
export function summarizeWeather(city: string, date: string, hours: EnvironmentalForecastPoint[]): string {
  const valid = hours.filter((h) => Number.isFinite(h.temperature) && Number.isFinite(h.rainProbability));
  if (!valid.length) throw new Error("no-weather");
  const temperatures = valid.map((h) => h.temperature);
  const aqi = valid.map((h) => h.aqi).filter(Number.isFinite);
  const periods = [["上午", 8, 11], ["下午", 12, 17], ["晚上", 18, 23]] as const;
  return `${city} · ${date} 天气预报（北京时间）\n全天温度 ${Math.min(...temperatures).toFixed(1)}–${Math.max(...temperatures).toFixed(1)}℃，最高逐小时降水概率 ${Math.max(...valid.map((h) => h.rainProbability))}%。\n${periods.flatMap(([name, from, to]) => {
    const rows = valid.filter((h) => h.hour >= from && h.hour <= to);
    return rows.length ? [`${name}：${Math.min(...rows.map((h) => h.temperature)).toFixed(1)}–${Math.max(...rows.map((h) => h.temperature)).toFixed(1)}℃，最高降水概率 ${Math.max(...rows.map((h) => h.rainProbability))}%。`] : [];
  }).join("\n")}${aqi.length ? `\nUS AQI 预报范围：${Math.min(...aqi)}–${Math.max(...aqi)}（不是 PM2.5 浓度）。` : ""}\n预报会更新，请在出发前再次核对；以上不是气象预警。`;
}

