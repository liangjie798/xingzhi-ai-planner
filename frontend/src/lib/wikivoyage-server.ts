export interface TravelReference {
  platform: "Wikivoyage";
  title: string;
  excerpt: string;
  url: string;
  license: "CC BY-SA";
}

const DEFAULT_API = "https://zh.wikivoyage.org/w/api.php";
const REFERENCE_SECTIONS = /^(观光|景点|游览|活动|饮食|餐饮|美食|抵达|交通)$/;
/** 中国大陆服务器通常无法直连 Wikimedia，可通过 WIKIVOYAGE_API_URL 指向可达镜像或代理。 */
function apiEndpoint() {
  const configured = process.env.WIKIVOYAGE_API_URL?.trim();
  return configured && configured.startsWith("https://") ? configured : DEFAULT_API;
}
const cache = new Map<string, { expires: number; value: TravelReference | null }>();

function stripWiki(value: string): string {
  let text = value.replace(/<!--[\s\S]*?-->/g, " ");
  for (let round = 0; round < 6; round += 1) {
    const next = text.replace(/\{\{[^{}]*\}\}/g, " ");
    if (next === text) break;
    text = next;
  }
  text = text
    .replace(/\{\|[\s\S]*?\|\}/g, " ")
    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g, "$1")
    .replace(/'{2,5}/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/^[\s*#:;]+/gm, "");
  return text.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

/** 只保留观光、饮食与抵达相关的条目，避免把整篇条目塞进模型或页面。 */
export function extractWikivoyageReference(wikitext: string): string {
  const lines = wikitext.split(/\r?\n/);
  const chunks: string[] = [];
  let active = false;
  for (const line of lines) {
    const heading = line.match(/^(={2,6})\s*(.+?)\s*=+\s*$/);
    if (heading) {
      if (heading[1].length === 2) active = REFERENCE_SECTIONS.test(stripWiki(heading[2]).replace(/\s+/g, ""));
      continue;
    }
    if (!active) continue;
    const text = stripWiki(line);
    if (text) chunks.push(text);
  }
  return chunks.join("\n").slice(0, 900).trim();
}

async function load(city: string): Promise<TravelReference | null> {
  for (const page of [...new Set([city, `${city}市`])]) {
    try {
      const query = new URLSearchParams({ action: "parse", page, prop: "wikitext", format: "json", formatversion: "2", redirects: "1" });
      const response = await fetch(`${apiEndpoint()}?${query}`, {
        signal: AbortSignal.timeout(3500),
        headers: { "User-Agent": "Xingzhi-Planning/1.0 (https://lht574.cn)" },
      });
      if (!response.ok) continue;
      const payload = await response.json() as { parse?: { title?: string; wikitext?: string | { "*": string } }; error?: unknown };
      const wikitext = typeof payload.parse?.wikitext === "string" ? payload.parse.wikitext : payload.parse?.wikitext?.["*"];
      if (!wikitext) continue;
      const excerpt = extractWikivoyageReference(wikitext);
      if (excerpt.length < 20) continue;
      const title = payload.parse?.title || page;
      return { platform: "Wikivoyage", title: `${title} · 维基导游路线参考`, excerpt, url: `https://zh.wikivoyage.org/wiki/${encodeURIComponent(title)}`, license: "CC BY-SA" };
    } catch {
      // 网络不可用时立即停止，避免每个方案都为第二个标题再等待一次超时。
      return null;
    }
  }
  return null;
}

export async function fetchWikivoyageReference(cityName: string): Promise<TravelReference | null> {
  const city = cityName.replace(/市$/, "").trim();
  if (!city) return null;
  const cached = cache.get(city);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await load(city);
  cache.set(city, { expires: Date.now() + (value ? 12 * 3600 * 1000 : 30 * 60 * 1000), value });
  return value;
}
