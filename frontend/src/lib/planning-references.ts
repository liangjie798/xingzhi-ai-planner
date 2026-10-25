import type { SocialResearch } from "./social-research";
import type { EvidenceItem } from "./types";

export interface PlanningReference { title: string; url: string; note: string }
const compact = (value: string, max: number) => value.replace(/\s+/g," ").trim().slice(0,max);
/** Main documents keep a small source list; raw search material remains in the evidence panel. */
export function planningReferences(evidence: EvidenceItem[], social?: SocialResearch): PlanningReference[] {
  const seen = new Set<string>();
  const references: PlanningReference[] = [];
  for (const item of evidence.filter(item => item.tag !== "联网检索资料")) {
    const url = item.sourceUrl;
    if (!url || !url.startsWith("https://") || seen.has(url)) continue;
    seen.add(url); references.push({ title:compact(item.title,70), url, note:compact(item.excerpt,90) });
    if (references.length >= 3) break;
  }
  let socialCount = 0;
  for (const item of social?.items || []) {
    if (socialCount >= 2 || seen.has(item.url) || !item.url.startsWith("https://") || /旅行社|TOP\s*\d|测评|避坑|名额有限|主营产品|联系我们|招选|招标|强力推荐|业内推荐/.test(item.title + " " + item.excerpt)) continue;
    seen.add(item.url); socialCount++;
    references.push({ title:compact(item.title,70), url:item.url, note:"公开搜索参考，未核验全文。" });
  }
  return references;
}
