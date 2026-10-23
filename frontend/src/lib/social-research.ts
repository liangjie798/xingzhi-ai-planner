export interface SocialItem { platform: string; title: string; excerpt: string; url: string; retrievedAt: string; provider?: string; publishedAt?: string }
export interface SocialResearch { items: SocialItem[]; sources: Array<{ platform: string; status: "available" | "unavailable"; detail: string }>; durationMs: number }
const decode = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
export function socialPlatform(raw: string): SocialItem["platform"] | null {
  try { const u = new URL(raw); if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    return /(^|\.)douyin\.com$/.test(u.hostname) ? "抖音" : /(^|\.)xiaohongshu\.com$/.test(u.hostname) ? "小红书" : null;
  } catch { return null; }
}
function isPost(url: string) { return /\/(?:video|note|explore|discovery\/item)\/[\da-z]+/i.test(url); }

type SearchSite = "xiaohongshu.com" | "douyin.com";
export function normalizeSearchResults(payload: unknown, city: string, provider: "百度搜索" | "Tavily", site?: SearchSite): SocialItem[] {
  const data = payload as { references?: unknown[]; results?: unknown[] } | null;
  const rows = provider === "百度搜索" ? data?.references : data?.results;
  if (!Array.isArray(rows)) return [];
  const cityTerm = city.split(/[·（(]/)[0].trim().replace(/(?:特别行政区|自治区|自治州|地区|市|县|区)$/, "");
  if (!cityTerm) return [];
  const items: SocialItem[] = [];
  for (const raw of rows.slice(0, 30)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (row.type && row.type !== "web") continue;
    const title = typeof row.title === "string" ? decode(row.title).slice(0, 160) : "";
    const excerpt = typeof row.content === "string" ? decode(row.content).slice(0, 650) : "";
    if (!title || !`${title} ${excerpt}`.includes(cityTerm) || /登录后|安全验证|验证码|页面不存在/.test(title)) continue;
    try {
      const url = new URL(String(row.url || ""));
      if (url.protocol !== "https:" || url.username || url.password || url.port || !/\.[a-z]{2,}$/i.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal|test)$/.test(url.hostname)) continue;
      if (site && !(url.hostname === site || url.hostname.endsWith(`.${site}`))) continue;
      const platform = socialPlatform(url.href);
      if (platform && !isPost(url.href)) continue;
      url.hash = "";
      items.push({ title, excerpt, url: url.href, platform: platform || url.hostname, provider, retrievedAt: new Date().toISOString(), ...(typeof row.date === "string" ? { publishedAt: row.date.slice(0, 40) } : {}) });
    } catch { /* Invalid links never reach the document or model. */ }
  }
  return [...new Map(items.map((item) => [item.url, item])).values()].slice(0, site ? 3 : 4);
}

const searchCache = new Map<string, { expires: number; task: Promise<SocialItem[]> }>();
async function searchWeb(city: string, activity: string, site?: SearchSite): Promise<SocialItem[]> {
  const tavily = process.env.WEB_SEARCH_PROVIDER === "tavily";
  const token = tavily ? process.env.TAVILY_API_KEY : process.env.BAIDU_SEARCH_API_KEY;
  if (!token) throw new Error("missing-key");
  const query = `${city.slice(0, 40)} ${activity.slice(0, 30)} ${/旅游|美食/.test(activity) ? "旅行攻略 景点 餐饮" : "活动组织 方案 实施安排"}`;
  const cacheKey = `${tavily}:${query}:${site || "web"}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.task;
  const task = (async () => {
    const response = await fetch(tavily ? "https://api.tavily.com/search" : "https://qianfan.baidubce.com/v2/ai_search/web_search", {
      method: "POST", redirect: "error", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(tavily ? { query, search_depth: "basic", max_results: 6, include_answer: false, include_raw_content: false, ...(site ? { include_domains: [site] } : {}) } : {
        messages: [{ role: "user", content: query }], search_source: "baidu_search_v2", resource_type_filter: [{ type: "web", top_k: 6 }],
        ...(site ? { search_filter: { match: { site: [site] } } } : {}),
      }), signal: AbortSignal.timeout(6500), cache: "no-store",
    });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "auth" : response.status === 429 ? "quota" : "upstream");
    const payload = await response.json();
    if (payload.code && String(payload.code) !== "0") throw new Error("upstream");
    if (!Array.isArray(tavily ? payload.results : payload.references)) throw new Error("schema");
    return normalizeSearchResults(payload, city, tavily ? "Tavily" : "百度搜索", site);
  })();
  if (searchCache.size >= 150) searchCache.delete(searchCache.keys().next().value!);
  searchCache.set(cacheKey, { expires: Date.now() + 600000, task });
  try { return await task; } catch (error) { searchCache.delete(cacheKey); throw error; }
}

export async function collectWebResearch(city: string, activity: string): Promise<SocialResearch> {
  const started = performance.now();
  const provider = process.env.WEB_SEARCH_PROVIDER === "tavily" ? "Tavily" : "百度搜索";
  const key = provider === "Tavily" ? process.env.TAVILY_API_KEY : process.env.BAIDU_SEARCH_API_KEY;
  if (!key) return { items: [], sources: [{ platform: provider, status: "unavailable", detail: "联网搜索尚未配置服务端 API Key，本轮未执行搜索；规划仍可使用天气与已核对地点。" }], durationMs: performance.now() - started };
  const scopes = [{ label: "全网攻略", site: undefined }, { label: "小红书收录内容", site: "xiaohongshu.com" as const }, { label: "抖音收录内容", site: "douyin.com" as const }];
  const results = await Promise.allSettled(scopes.map((scope) => searchWeb(city, activity, scope.site)));
  const items: SocialItem[] = [];
  const sources: SocialResearch["sources"] = [];
  results.forEach((result, index) => {
    const platform = `${provider} · ${scopes[index].label}`;
    if (result.status === "fulfilled") {
      items.push(...result.value);
      sources.push({ platform, status: result.value.length ? "available" : "unavailable", detail: result.value.length ? `获得 ${result.value.length} 条匹配目的地的搜索摘要，附原文链接；未验证全文，不代表平台热榜或实时热度。` : "未获得可核对且匹配目的地的结果；不代表该平台没有相关内容。" });
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : "";
      sources.push({ platform, status: "unavailable", detail: reason === "auth" ? "搜索密钥无效或未开通权限，请管理员检查配置。" : reason === "quota" ? "搜索服务限流或额度不足，请稍后重试。" : "搜索服务暂不可用或请求超时，本轮未计入搜索内容。" });
    }
  });
  return { items: [...new Map(items.map((item) => [item.url, item])).values()].slice(0, 8), sources, durationMs: performance.now() - started };
}
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
  const web = await collectWebResearch(city, activity);
  const items: SocialItem[] = [...web.items];
  const sources: SocialResearch["sources"] = [...web.sources];
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
    const provided = urls.filter((url) => socialPlatform(url) === platform).slice(0, 2);
    if (!provided.length) return;
    try {
      const pages = await Promise.allSettled(provided.map(readPublic));
      for (const page of pages) {
        if (page.status !== "fulfilled") continue;
        items.push(...parseSocialHtml(page.value.html, page.value.url));
      }
    } catch { /* Record absence honestly below. */ }
    const count = items.filter((item) => item.platform === platform).length;
    sources.push({ platform, status: count ? "available" : "unavailable", detail: count ? `获取 ${count} 条可核对公开内容，不代表热度排名` : "未获得可解析公开内容；页面可能需要登录、验证或授权接口" });
  }));
  return { items: [...new Map(items.map((item) => [item.url, item])).values()].slice(0, 8), sources, durationMs: performance.now() - started };
}
