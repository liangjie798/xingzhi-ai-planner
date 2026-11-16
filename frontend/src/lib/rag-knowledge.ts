/**
 * 本地 RAG 知识库：把已经审核过的产品知识、城市简介整理成文档块，
 * 用 BM25（中文字符二元组 + 英文词）做轻量检索，不依赖外部向量服务。
 * 检索结果既用于问答兜底，也作为模型回答时的事实依据与来源。
 */
import { knowledgeBase } from "./conversation-knowledge.ts";
import { cityProfiles } from "./city-introduction.ts";

export interface RagDocument {
  id: string;
  title: string;
  text: string;
  source?: string;
  kind: "knowledge" | "city";
}
export interface RagHit extends RagDocument {
  score: number;
}

const CITY_SYNONYMS: Record<string, string[]> = {
  住宿: ["酒店", "民宿", "住哪里", "宾馆"],
  交通: ["地铁", "公交", "打车", "自驾", "停车", "换乘", "高铁", "火车"],
  下雨: ["雨天", "降雨", "降水", "雨具", "带伞"],
  预约: ["门票", "开放", "闭馆", "营业"],
  装备: ["带什么", "穿什么", "行李", "防晒"],
  人群: ["老人", "亲子", "儿童", "无障碍", "轮椅", "学生"],
  预算: ["费用", "花费", "人均", "价格"],
  研学: ["实践", "学习任务", "校园"],
};

/** 补充知识文档：平台使用、票务、出行准备与安全边界等经过审核的通用说明。 */
const EXTRA_DOCUMENTS: RagDocument[] = [
  { id: "knowledge:packing-checklist", title: "出发前检查清单", kind: "knowledge", source: "https://www.weather.com.cn/", text: "出发前一天核对天气预警、景点或场馆预约、交通班次与退改政策；出发前两小时再次查看最新预报和路况。随身携带证件、饮水、雨具、充电设备和个人必需药品；团队出行指定联络人并约定集合地点与失联处理方式。" },
  { id: "knowledge:rail-ticket", title: "高铁动车票务与换乘", kind: "knowledge", source: "https://kyfw.12306.cn/", text: "高铁、动车和普速列车均可在12306查询。购票前核对出发站与到达站（同城有多个车站时尤其注意），换乘预留时间建议同站不少于30分钟、异站不超过2小时并考虑安检与步行。余票、票价和退改规则以12306购票页面为准，中转方案需要确认两段均可购买。" },
  { id: "knowledge:flight-verify", title: "航班与机票价格核实", kind: "knowledge", source: "https://www.caac.gov.cn/", text: "航司官网展示价通常为票面价，最终支付需叠加机建燃油和行李等费用。比价时确认出发和到达机场、航班号、起降时间和是否经停；中转或联程需确认行李直挂与改签规则。价格和余票具有时效性，以航司官网下单页面为准。" },
  { id: "knowledge:weather-outdoor", title: "天气与户外活动安排", kind: "knowledge", source: "https://www.cma.gov.cn/", text: "户外活动应避开高温、雷电、大风和强降雨时段，逐小时降水概率可用于选择窗口，但降水概率不等于降雨量。遇到气象部门发布的高温、暴雨、雷电或大风预警，应调整或取消户外安排。天气数据是城市网格预报，不是活动地点的现场实测。" },
  { id: "knowledge:air-sensitive", title: "空气质量与敏感人群", kind: "knowledge", source: "https://open-meteo.com/en/docs/air-quality-api", text: "US AQI 用于比较空气污染水平，PM2.5 是细颗粒物浓度，二者不是同一指标。儿童、老人、孕妇和呼吸系统疾病人群对空气污染更敏感，空气质量较差时应减少高强度户外活动并留意官方健康提示；本平台不能提供医疗诊断。" },
  { id: "knowledge:student-activity", title: "学生集体活动组织", kind: "knowledge", source: "https://www.moe.gov.cn/", text: "学生集体活动需明确带队教师与安全责任人、分组名单、签到清点、医疗联络和家长沟通方式；活动强度与学生年龄、身体状况匹配，安排补水休息和应急集合点。场地使用、人数上限与保险要求按学校或主办方规定执行。" },
  { id: "knowledge:senior-family", title: "老人与亲子出行", kind: "knowledge", source: "https://www.weather.com.cn/", text: "与老人或儿童同行时，减少长时间步行与频繁换乘，预留休息、如厕和用餐时间，避免极端天气时段户外停留。无障碍通道、电梯、母婴设施和座位情况需要向场馆或交通运营方确认，规划中的建议不等于已经核实。" },
  { id: "knowledge:budget", title: "预算与费用估算", kind: "knowledge", source: "https://www.12306.cn/", text: "费用通常包括交通、门票、餐饮、住宿和保险。规划中的预算为估算，不能替代实时报价；门票减免、学生票、老年票和团体票需要按场馆与运营方规则核实。将总预算拆分为人均预算可以减少误解。" },
  { id: "knowledge:schedule", title: "时间安排与交通衔接", kind: "knowledge", source: "https://www.amap.com/", text: "排程应为每段交通预留缓冲，按片区集中安排相邻地点，减少往返。餐饮和休息时间要计入整体行程；景点开放时间、预约时段与末班车可能变化，出发前需再次核对。地图连线表示游览顺序，不代表实际道路导航。" },
  { id: "knowledge:emergency", title: "活动应急预案", kind: "knowledge", source: "https://www.mem.gov.cn/", text: "预案应包含风险识别、预警接收、人员清点、医疗联络、疏散路线、备用场地和取消条件，并明确各环节负责人。遇到官方预警、场地关闭或交通中断，按预案调整并及时通知参与者；本平台建议不能替代现场指挥和专业救援。" },
  { id: "knowledge:hotel", title: "住宿与退改", kind: "knowledge", source: "https://www.mct.gov.cn/", text: "选择住宿时核对真实地址、交通接驳、入住时间、押金、取消与退改政策以及是否接待儿童或外宾。价格与房态具有时效性，以酒店官方或预订平台页面为准；本平台不代订，也不能保证房源。" },
  { id: "knowledge:rag-memory", title: "对话记忆与隐私", kind: "knowledge", source: "https://lht574.cn/privacy", text: "对话记忆用于在当前独立对话中保留已确认的城市、日期、人数和活动条件，避免重复询问；注册用户的对话按账户保存，访客记忆仅在本次登录会话有效。清除记忆后不会从原文或摘要中召回旧条件。请勿在对话中提交身份证号、银行卡号、密码或密钥。" },
  { id: "knowledge:data-boundary", title: "数据来源与核实边界", kind: "knowledge", source: "https://lht574.cn/terms", text: "天气与空气质量来自 Open-Meteo 预报，位置解析与地点检索使用高德服务，火车票来自12306，机票来自各航司官网展示价。实时价格、余票、开放状态和预警可能变化，回答会标注来源与获取时间；无法核实时明确说明，不把搜索结果当作已核验事实。" },
  { id: "knowledge:transfer", title: "中转与联程注意事项", kind: "knowledge", source: "https://kyfw.12306.cn/", text: "中转方案需要确认两段交通的到达与出发时间、同城换乘距离、行李是否直挂以及误点后的改签规则。火车中转建议同站预留40分钟、异站预留100分钟以上；航班中转还应考虑值机与安检时间。中转组合不是联程票，未购买前不能保证可以衔接。" },
  { id: "knowledge:scenic", title: "景点选择与预约", kind: "knowledge", source: "https://www.mct.gov.cn/", text: "选择景点时综合考虑开放时间、预约要求、游览时长、步行强度和人流高峰。热门场馆通常需要提前实名预约，节假日和周末建议更早安排。景区承载量、临时闭园和活动信息以官方公告为准；规划中的开放状态如未核实会明确标注。" },
];

function cityDocuments(): RagDocument[] {
  return Object.entries(cityProfiles).map(([city, profile]) => ({
    id: `city:${city}`,
    title: `${city}城市介绍`,
    text: String(profile.reply).replace(/\s+/g, " "),
    source: profile.sources?.[0]?.url,
    kind: "city" as const,
  }));
}

function splitLongDocument(document: RagDocument): RagDocument[] {
  if (document.text.length <= 320) return [document];
  const sentences = document.text.split(/(?<=[。！？；\n])/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    if (buffer.length + sentence.length > 280 && buffer) { chunks.push(buffer); buffer = ""; }
    buffer += sentence;
    if (buffer.length >= 280) { chunks.push(buffer); buffer = ""; }
  }
  if (buffer) chunks.push(buffer);
  return chunks.map((text, index) => ({ ...document, id: `${document.id}#${index + 1}`, title: chunks.length > 1 ? `${document.title}（${index + 1}/${chunks.length}）` : document.title, text }));
}

let cachedIndex: { documents: RagDocument[]; tokenSets: Set<string>[]; documentFrequencies: Map<string, number>; averageLength: number } | undefined;

const STOP = new Set(["什么", "怎么", "如何", "为什么", "可以", "需要", "这个", "那个", "我们", "你们", "自己", "一下", "请问", "告诉", "知道"]);

function tokens(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[\s，。！？、；：""''（）()《》【】,.!?;:]+/g, " ");
  const words = normalized.match(/[a-z0-9]{2,}/g) || [];
  const cjk = [...normalized.matchAll(/[\u4e00-\u9fa5]/g)].map((match) => match[0]);
  const pairs: string[] = [];
  for (let index = 0; index + 1 < cjk.length; index++) pairs.push(cjk[index] + cjk[index + 1]);
  return [...new Set([...words, ...cjk, ...pairs].filter((token) => token.length >= 2 && !STOP.has(token)))];
}

function buildIndex() {
  if (cachedIndex) return cachedIndex;
  const raw = [
    ...knowledgeBase.map((item) => ({ id: `knowledge:${item.id}`, title: item.title, text: item.text, source: "source" in item ? String(item.source) : undefined, kind: "knowledge" as const })),
    ...EXTRA_DOCUMENTS,
    ...cityDocuments(),
  ];
  const documents = raw.flatMap(splitLongDocument);
  const tokenSets = documents.map((document) => new Set(tokens(`${document.title} ${document.text}`)));
  const documentFrequencies = new Map<string, number>();
  for (const set of tokenSets) for (const token of set) documentFrequencies.set(token, (documentFrequencies.get(token) ?? 0) + 1);
  const averageLength = tokenSets.reduce((sum, set) => sum + set.size, 0) / Math.max(1, tokenSets.length);
  cachedIndex = { documents, tokenSets, documentFrequencies, averageLength };
  return cachedIndex;
}

/** 用 BM25 检索本地知识库；city 命中时给对应城市文档加权。 */
export function retrieveRag(query: string, options: { topK?: number; city?: string } = {}): RagHit[] {
  const { documents, tokenSets, documentFrequencies, averageLength } = buildIndex();
  const topK = Math.max(1, Math.min(8, options.topK ?? 4));
  const expanded = Object.entries(CITY_SYNONYMS).flatMap(([key, synonyms]) => synonyms.some((synonym) => query.includes(synonym)) ? [key, ...synonyms] : []);
  const queryTokens = tokens(`${query} ${expanded.join(" ")}`);
  if (!queryTokens.length) return [];
  const hits: RagHit[] = [];
  const total = documents.length;
  documents.forEach((document, index) => {
    const set = tokenSets[index];
    let score = 0;
    for (const token of queryTokens) {
      if (!set.has(token)) continue;
      const frequency = documentFrequencies.get(token) ?? 0;
      const idf = Math.log(1 + (total - frequency + 0.5) / (frequency + 0.5));
      score += idf * (1 + 0.8) / (1 + 0.8 * (1 - 0.6) + 0.8 * (set.size / Math.max(1, averageLength)));
    }
    if (options.city && document.kind === "city" && document.title.startsWith(options.city)) score += 2.5;
    if (options.city && document.kind !== "city" && document.text.includes(options.city)) score += 0.6;
    if (score > 0) hits.push({ ...document, score: Math.round(score * 100) / 100 });
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, topK);
}

/** 供模型提示与降级回答使用的纯文本证据块。 */
export function ragEvidence(hits: RagHit[]): string {
  return hits.map((hit, index) => `[K${index + 1}] ${hit.title}：${hit.text}`).join("\n");
}

export function ragSources(hits: RagHit[]) {
  return hits.map((hit) => ({ title: `知识库 · ${hit.title}`, ...(hit.source ? { url: hit.source } : {}), detail: `本地 RAG 检索命中，相关度 ${hit.score.toFixed(2)}` }));
}

export function ragKnowledgeSize() {
  return buildIndex().documents.length;
}
