interface AirSource { airQualityReused?: boolean; airQualitySourceDate?: string }

export function airQualityNote(hours: AirSource[]): string {
  const reused = hours.filter(hour => hour.airQualityReused === true);
  if (!reused.length) return "";
  const dates = [...new Set(reused.map(hour => hour.airQualitySourceDate).filter((date): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
  return `空气质量有${reused.length}个小时复用了${dates.length ? dates.join("、") : "此前可用日期"}的同小时数据，属于替代估算，不是所选日期的独立空气预报；执行前请复核。`;
}
