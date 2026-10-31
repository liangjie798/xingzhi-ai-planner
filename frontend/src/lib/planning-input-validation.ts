import { isRecord } from "./request-validation.ts";

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Check raw client context before history normalization or memory actions can discard it. */
export function hasValidConversationContext(body: Record<string, unknown>): boolean {
  if (body.intake !== undefined && (!isRecord(body.intake) || !isRecord(body.intake.known))) return false;
  if ([body.weatherContext, body.knowledgeContext].some(value => value !== undefined && !isRecord(value))) return false;
  if (body.history !== undefined && (!Array.isArray(body.history) || body.history.some(item =>
    !isRecord(item) || typeof item.role !== "string" || !["user", "assistant"].includes(item.role) || typeof item.content !== "string"))) return false;
  if (body.chartContext !== undefined) {
    const chart = body.chartContext;
    if (!isRecord(chart)
      || chart.cityName !== undefined && (typeof chart.cityName !== "string" || !chart.cityName.trim() || chart.cityName.length > 80)
      || !Array.isArray(chart.dates) || !chart.dates.length || chart.dates.length > 7 || chart.dates.some(date => !isCalendarDate(date))
      || !Array.isArray(chart.metrics) || !chart.metrics.length || chart.metrics.some(metric => typeof metric !== "string" || !["temperature", "rainProbability"].includes(metric))) return false;
  }
  return true;
}

const inRange = (value: unknown, max: number) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;

/** Forecast percentages and US AQI use the same ranges as the weather display. */
export function isTourismHour(value: unknown): boolean {
  return isRecord(value) && isCalendarDate(value.date)
    && Number.isInteger(value.hour) && Number(value.hour) >= 0 && Number(value.hour) <= 23
    && typeof value.temperature === "number" && Number.isFinite(value.temperature)
    && inRange(value.humidity, 100) && inRange(value.rainProbability, 100)
    && inRange(value.aqi, 500) && inRange(value.heatRisk, 100);
}
