import type { TourismStop } from "./types";

const escape = (text: string) => text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const LABEL_LIMIT = 10;
/** 导出 Word/Markdown 时使用的静态示意图：按标题长度增加左右留白与画布宽度，避免首尾被裁切。 */
function shorten(text: string, limit = LABEL_LIMIT) {
  const value = text.trim();
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}
export function routeDiagram(stops: TourismStop[]) {
  const height = 220;
  const labels = stops.map((stop) => shorten(stop.name));
  const maxNameWidth = Math.max(28, ...labels.map((label) => label.length * 12));
  const padding = Math.min(170, Math.max(96, Math.ceil(maxNameWidth / 2) + 28));
  const gap = 190;
  const width = Math.max(900, Math.round(padding * 2 + Math.max(1, stops.length - 1) * gap));
  const step = stops.length > 1 ? (width - padding * 2) / (stops.length - 1) : 0;
  const startX = stops.length > 1 ? padding : width / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="14" fill="#f0f3e9"/><text x="28" y="30" font-family="sans-serif" font-size="13" fill="#63725d">行程顺序示意 · 非道路导航</text><path d="M${padding} 84H${width - padding}" stroke="#94ad96" stroke-width="3" stroke-dasharray="7 6"/>${stops.map((s, i) => `<g transform="translate(${startX + i * step} 84)"><circle r="18" fill="${s.category === "美食" ? "#b07936" : "#315d40"}"/><text text-anchor="middle" y="6" font-size="16" font-family="sans-serif" fill="white">${i + 1}</text><text text-anchor="middle" y="45" font-family="sans-serif" font-size="14" fill="#2d4937">${escape(s.time)}</text><text text-anchor="middle" y="72" font-family="sans-serif" font-size="12" fill="#2d4937">${escape(labels[i])}</text><text text-anchor="middle" y="96" font-family="sans-serif" font-size="11" fill="#72816c">${escape(s.category)}</text></g>`).join("")}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function documentImage(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url.startsWith("data:image/svg+xml") ? url : `/plan-media?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(9000) });
    if (!response.ok) return null;
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob).catch(() => null);
    const canvas = window.document.createElement("canvas");
    let source: CanvasImageSource;
    if (bitmap) source = bitmap;
    else {
      const img = new window.Image();
      img.src = URL.createObjectURL(blob);
      try { await img.decode(); } finally { URL.revokeObjectURL(img.src); }
      source = img;
    }
    const sourceWidth = bitmap?.width ?? (source as HTMLImageElement).naturalWidth;
    const sourceHeight = bitmap?.height ?? (source as HTMLImageElement).naturalHeight;
    canvas.width = Math.min(1400, sourceWidth);
    canvas.height = Math.round(canvas.width * sourceHeight / sourceWidth);
    canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
    bitmap?.close();
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return png ? new Uint8Array(await png.arrayBuffer()) : null;
  } catch { return null; }
}
