import type { EnvironmentalForecastPoint } from "./types";

export function weatherPlace(message: string): string | undefined {
  const text = message.replace(/^(?:请|帮我|查一下|查询|告诉我|看看|我想知道|查查|查)+/, "")
    .replace(/大后天|后天|明天|今天|今日|现在|目前/g, "").trim();
  const match = text.match(/^([\u4e00-\u9fa5]{2,10}?)(?:的)?(?:天气|气温|温度|湿度|空气质量|降雨概率|降水概率)/);
  return match && !/^(会不会|会|是否|这里|那里|当地|这个|如何|怎么样|什么)$/.test(match[1]) ? match[1] : undefined;
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

