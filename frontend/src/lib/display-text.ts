import { cities } from "@/lib/cities";

/**
 * 历史决策记录中可能包含旧版本写入的内部规则编号（如 [mee-aqi-05]）。
 * 这些编号对普通用户没有意义，展示前统一移除，保留可读的正文。
 */
export function withoutInternalRuleTags(text: string): string {
  return text
    .replace(/\s*\[[a-z0-9]+(?:-[a-z0-9]+)+\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([，。；：、）])/g, "$1")
    .trim();
}

/**
 * 历史记录里的 cityId 可能是城市 id（如 hangzhou），也可能是高德行政区编号
 * （如 amap-330100）。尽量转换成用户可读的城市名，无法识别时保留原值。
 */
export function cityDisplayName(cityId: string): string {
  const direct = cities.find((city) => city.id === cityId);
  if (direct) return direct.name;
  const adcode = cityId.replace(/^amap-/, "");
  if (/^\d{6}$/.test(adcode)) {
    const byAdcode = cities.find((city) => city.adcode === adcode);
    if (byAdcode) return byAdcode.name;
  }
  return cityId;
}
