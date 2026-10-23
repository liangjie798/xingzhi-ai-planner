import type { TourismStop } from "./types";
const escape = (text: string) => text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
export function routeDiagram(stops: TourismStop[]) {
  const width = 900, height = 210;
  const step = (width - 100) / Math.max(1, stops.length - 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="900" height="210" rx="14" fill="#f0f3e9"/><text x="28" y="30" font-family="sans-serif" font-size="13" fill="#63725d">行程顺序示意 · 非道路导航</text><path d="M50 80H850" stroke="#94ad96" stroke-width="3" stroke-dasharray="7 6"/>${stops.map((s, i) => `<g transform="translate(${50 + i * step} 80)"><circle r="18" fill="${s.category === "美食" ? "#b07936" : "#315d40"}"/><text text-anchor="middle" y="6" font-size="16" font-family="sans-serif" fill="white">${i + 1}</text><text text-anchor="middle" y="45" font-family="sans-serif" font-size="14" fill="#2d4937">${escape(s.time)}</text><text text-anchor="middle" y="72" font-family="sans-serif" font-size="12" fill="#2d4937">${escape(s.name.slice(0, 12))}</text><text text-anchor="middle" y="96" font-family="sans-serif" font-size="11" fill="#72816c">${escape(s.category)}</text></g>`).join("")}</svg>`;
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
    canvas.width = Math.min(1100, sourceWidth);
    canvas.height = Math.round(canvas.width * sourceHeight / sourceWidth);
    canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
    bitmap?.close();
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return png ? new Uint8Array(await png.arrayBuffer()) : null;
  } catch { return null; }
}
