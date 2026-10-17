export interface ComfortMetrics {
  heatRisk: number;
  aqi: number;
  rainProbability: number;
}

/** 与后端"活动适宜度"同源的轻量计算：100 - 热风险 - AQI 惩罚 - 降雨惩罚 */
export function comfortScore(metrics: ComfortMetrics): number {
  const raw = 100 - metrics.heatRisk * 0.42 - Math.max(0, metrics.aqi - 35) * 0.21 - metrics.rainProbability * 0.18;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

export function comfortLevel(score: number): "适宜" | "谨慎" | "不建议" {
  if (score >= 70) return "适宜";
  if (score >= 50) return "谨慎";
  return "不建议";
}
