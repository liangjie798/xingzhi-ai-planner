import { addDays } from "./conversation-intake.ts";
export interface WeatherChartSpec { kind:"weather-comparison";dates:string[];metrics:Array<"temperature"|"rainProbability"> }
export function weatherChartRequest(message:string,known:{date?:string;endDate?:string}):WeatherChartSpec|null {
  if(!/图|画|绘|可视化|对比|比较/.test(message)||!/气温|温度|降雨|降水/.test(message)||!known.date)return null;
  const metrics:WeatherChartSpec["metrics"]=[];
  if(/气温|温度/.test(message))metrics.push("temperature");
  if(/降雨|降水/.test(message))metrics.push("rainProbability");
  const end=known.endDate || (/两天|两日/.test(message)?addDays(known.date,1):known.date);
  const dates:string[]=[];
  for(let day=known.date;day<=end&&dates.length<7;day=addDays(day,1))dates.push(day);
  return {kind:"weather-comparison",dates,metrics};
}
