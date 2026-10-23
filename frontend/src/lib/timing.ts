/** Keep fast local work visible without inventing a minimum execution time. */
export function formatDuration(milliseconds: number | null | undefined): string {
  if (milliseconds == null || !Number.isFinite(milliseconds) || milliseconds < 0) return "未记录";
  if (milliseconds < 1) return "<1 毫秒";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} 毫秒`;
  if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(2)} 秒`;
  return `${Math.floor(milliseconds / 60000)} 分 ${Math.round((milliseconds % 60000) / 1000)} 秒`;
}
