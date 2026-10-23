export interface SocialItem { platform: "抖音" | "小红书"; title: string; excerpt: string; url: string; retrievedAt: string }
export interface SocialResearch { items: SocialItem[]; sources: Array<{ platform: string; status: "available" | "unavailable"; detail: string }>; durationMs: number }
const decode = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
export function socialPlatform(raw: string): SocialItem["platform"] | null {
  try { const u = new URL(raw); if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    return /(^|\.)douyin\.com$/.test(u.hostname) ? "抖音" : /(^|\.)xiaohongshu\.com$/.test(u.hostname) ? "小红书" : null;
  } catch { return null; }
}
function isPost(url: string) { return /\/(?:video|note|explore|discovery\/item)\/[\da-z]+/i.test(url); }
export function parseSocialHtml(html: string, url: string): SocialItem[] {
  const platform = socialPlatform(url);
  if (!platform) return [];
  const meta = (key: string) => {
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
      const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [m[1].toLowerCase(), m[2]]));
      if ((attrs.property || attrs.name) === key) return decode(attrs.content || "");
    }
    return "";
  };
  const title = meta("og:title") || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const excerpt = meta("og:description") || meta("description");
  if (!isPost(url) || !title || /登录|验证码|安全验证|访问受限|页面不存在|小红书.*生活指南|抖音.*美好生活/.test(title)) return [];
  return [{ platform, title: title.slice(0, 160), excerpt: excerpt.slice(0, 650), url, retrievedAt: new Date().toISOString() }];
}
async function readPublic(url: string): Promise<{ html: string; url: string }> {
  let current = url;
  for (let redirects = 0; redirects < 3; redirects++) {
    if (!socialPlatform(current)) throw new Error("非平台公开地址");
    const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(3500), headers: { "User-Agent": "Xingzhi-Public-Research/1.0", Accept: "text/html" }, next: { revalidate: 1800 } });
    if (response.status >= 300 && response.status < 400) { current = new URL(response.headers.get("location") || "", current).href; continue; }
    if (!response.ok) throw new Error("公开页面不可用");
    const reader = response.body?.getReader(); if (!reader) throw new Error("页面为空");
    const decoder = new TextDecoder(); let html = ""; let bytes = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 1500000) { await reader.cancel(); break; } html += decoder.decode(value, { stream: true }); }
    return { html, url: current };
  }
  throw new Error("页面重定向过多");
}
export async function collectSocialResearch(city: string, activity: string, urls: string[] = []): Promise<SocialResearch> {
  const started = performance.now();
  const items: SocialItem[] = [];
  const sources: SocialResearch["sources"] = [];
  // Optional authorized service. Credentials stay on the server; schema is documented in docs/social-research.md.
  if (process.env.SOCIAL_RESEARCH_ENDPOINT) {
    try {
      const response = await fetch(process.env.SOCIAL_RESEARCH_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.SOCIAL_RESEARCH_TOKEN ? { Authorization: `Bearer ${process.env.SOCIAL_RESEARCH_TOKEN}` } : {}) }, body: JSON.stringify({ city, activity, limit: 8 }), signal: AbortSignal.timeout(6000), cache: "no-store" });
      if (!response.ok) throw new Error("授权服务不可用");
      const payload = await response.json() as { items?: SocialItem[] };
      for (const item of (Array.isArray(payload.items) ? payload.items : []).slice(0, 8)) {
        const platform = socialPlatform(item.url);
        if (platform && isPost(item.url) && typeof item.title === "string" && item.title.trim()) items.push({ platform, title: decode(item.title).slice(0, 160), excerpt: decode(String(item.excerpt || "")).slice(0, 650), url: item.url, retrievedAt: new Date().toISOString() });
      }
    } catch { /* Public pages remain available as a separate attempt. */ }
  }
  await Promise.all((["抖音", "小红书"] as const).map(async (platform) => {
    const query = encodeURIComponent(`${city} ${activity} 攻略`);
    const searchUrl = platform === "抖音" ? `https://www.douyin.com/search/${query}` : `https://www.xiaohongshu.com/search_result?keyword=${query}`;
    try {
      const provided = urls.filter((url) => socialPlatform(url) === platform).slice(0, 2);
      // Search pages often require login. Only actual post metadata counts as collected content.
      const pages = await Promise.allSettled((provided.length ? provided : [searchUrl]).map(readPublic));
      for (const page of pages) {
        if (page.status !== "fulfilled") continue;
        items.push(...parseSocialHtml(page.value.html, page.value.url));
        if (!provided.length) {
          const found = [...page.value.html.matchAll(/https:\/\/(?:www\.)?(?:douyin|xiaohongshu)\.com\/(?:video|note|explore)\/[\da-z]+/gi)].map((m) => m[0]);
          const posts = await Promise.allSettled([...new Set(found)].slice(0, 2).map(readPublic));
          posts.forEach((post) => { if (post.status === "fulfilled") items.push(...parseSocialHtml(post.value.html, post.value.url)); });
        }
      }
    } catch { /* Record absence honestly below. */ }
    const count = items.filter((item) => item.platform === platform).length;
    sources.push({ platform, status: count ? "available" : "unavailable", detail: count ? `获取 ${count} 条可核对公开内容，不代表热度排名` : "未获得可解析公开内容；页面可能需要登录、验证或授权接口" });
  }));
  return { items: [...new Map(items.map((item) => [item.url, item])).values()].slice(0, 8), sources, durationMs: performance.now() - started };
}
