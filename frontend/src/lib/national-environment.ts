import type { GridPoint } from "./types";

// Province-level representative locations; these are samples, not province-wide measurements.
export const nationalLocations = [
  ["110000", "北京市", 116.4, 39.9], ["120000", "天津市", 117.2, 39.12], ["130000", "河北省", 114.51, 38.04],
  ["140000", "山西省", 112.55, 37.87], ["150000", "内蒙古自治区", 111.75, 40.84], ["210000", "辽宁省", 123.43, 41.8],
  ["220000", "吉林省", 125.32, 43.82], ["230000", "黑龙江省", 126.64, 45.76], ["310000", "上海市", 121.47, 31.23],
  ["320000", "江苏省", 118.8, 32.06], ["330000", "浙江省", 120.15, 30.27], ["340000", "安徽省", 117.23, 31.82],
  ["350000", "福建省", 119.3, 26.08], ["360000", "江西省", 115.86, 28.68], ["370000", "山东省", 117.12, 36.65],
  ["410000", "河南省", 113.62, 34.75], ["420000", "湖北省", 114.3, 30.59], ["430000", "湖南省", 112.94, 28.23],
  ["440000", "广东省", 113.26, 23.13], ["450000", "广西壮族自治区", 108.37, 22.82], ["460000", "海南省", 110.2, 20.04],
  ["500000", "重庆市", 106.55, 29.56], ["510000", "四川省", 104.07, 30.57], ["520000", "贵州省", 106.63, 26.65],
  ["530000", "云南省", 102.71, 25.04], ["540000", "西藏自治区", 91.14, 29.65], ["610000", "陕西省", 108.94, 34.34],
  ["620000", "甘肃省", 103.83, 36.06], ["630000", "青海省", 101.78, 36.62], ["640000", "宁夏回族自治区", 106.23, 38.49],
  ["650000", "新疆维吾尔自治区", 87.62, 43.83], ["710000", "台湾省", 121.56, 25.03],
  ["810000", "香港特别行政区", 114.17, 22.32], ["820000", "澳门特别行政区", 113.55, 22.2],
] as const;
export interface NationalSample extends GridPoint { adcode: string; name: string; observedAt: string }
export interface NationalEnvironment { samples: NationalSample[]; expected: number; retrievedAt: string; source: string }
interface Source { current?: Record<string, unknown>; hourly?: { time?: string[]; precipitation_probability?: unknown[] } }
export function mergeNationalSamples(locations: ReadonlyArray<readonly [string, string, number, number]>, weather: Source[], air: Source[]): NationalSample[] {
  return locations.flatMap(([adcode, name, longitude, latitude], index) => {
    const current = weather[index]?.current;
    const quality = air[index]?.current;
    const temperature = current?.temperature_2m, humidity = current?.relative_humidity_2m, apparent = current?.apparent_temperature, aqi = quality?.us_aqi;
    if (![temperature, humidity, apparent, aqi].every((value) => typeof value === "number" && Number.isFinite(value))) return [];
    const time = current?.time;
    if (typeof time !== "string") return [];
    const hourIndex = weather[index]?.hourly?.time?.indexOf(time.slice(0, 13) + ":00") ?? -1;
    const rain = weather[index]?.hourly?.precipitation_probability?.[hourIndex];
    if (typeof rain !== "number" || !Number.isFinite(rain)) return [];
    const t = temperature as number, h = humidity as number, a = aqi as number;
    const heatRisk = Math.round(Math.min(100, Math.max(0, (apparent as number) - 20) * 4.2 + Math.max(0, h - 55) * .35 + Math.max(0, 8 - t) * 3));
    return [{ adcode, name, longitude, latitude, temperature: t, humidity: h, aqi: a, rainProbability: rain, heatRisk, comfort: Math.round(Math.max(0, 100 - heatRisk * .42 - Math.max(0, a - 35) * .21 - rain * .18)), observedAt: time + "+08:00" }];
  });
}
