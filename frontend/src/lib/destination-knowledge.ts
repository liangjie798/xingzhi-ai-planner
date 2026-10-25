/** Reviewed matching rules, not claims about a venue's accessibility or current prices. */
export const audienceGuides = {
  family: { label: "亲子家庭", keywords: "科技馆 自然博物馆 公园", prefer: /科技馆|自然|博物馆|公园|动物|亲子/, avoid: /酒|夜店|漂流|攀岩|登山|企业|公司/, reason: "优先考虑有观察、探索或互动内容的地点，便于围绕孩子的兴趣安排；具体项目年龄限制需核实。", checks: "确认孩子年龄、身高限制、卫生间和休息条件，减少连续排队与跨区转场。" },
  student: { label: "学生", keywords: "博物馆 历史街区 公园", prefer: /博物馆|美术馆|历史|文化|街区|公园|遗址/, avoid: /高尔夫|私人会所/, reason: "优先考虑文化学习、城市漫步与自然观察，便于结合兴趣安排；是否有学生优惠需单独核实。", checks: "确认预算和学生证适用条件，不将场馆或景点默认写成免费。" },
  senior: { label: "老年同行者", keywords: "博物馆 城市公园 园林", prefer: /博物馆|美术馆|公园|园林|文化馆|展览/, avoid: /登山|山顶|攀岩|漂流|蹦极|骑行|夜店|步道/, reason: "优先选择可分段参观的文化场馆或休闲地点，便于缩短单次活动并安排休息；实际距离和台阶仍需核查。", checks: "先确认能连续步行多久、是否需要电梯或轮椅；不因年龄推断健康状态。" },
  accessible: { label: "需要无障碍条件的同行者", keywords: "博物馆 美术馆 城市公园", prefer: /博物馆|美术馆|文化馆|展览|公园/, avoid: /登山|山顶|古塔|漂流|攀岩|骑行|步道/, reason: "将场馆或公园作为无障碍条件的待核实候选；仅凭名称无法确认是否可通行。", checks: "预约前直接向场馆确认连续无台阶路线、电梯、无障碍卫生间及轮椅借用，不承诺候选已具备这些设施。" },
  adult: { label: "成年同行者", keywords: "历史街区 博物馆 城市公园", prefer: /历史|文化|街区|博物馆|公园/, avoid: /私人会所/, reason: "可按历史文化、自然休闲或本地生活等兴趣组合，具体活动强度由同行者决定。", checks: "补充兴趣、预算和可接受的步行强度后可继续细化。" },
  couple: { label: "情侣同行", keywords: "美术馆 历史街区 城市公园", prefer: /美术馆|博物馆|历史|街区|公园|园林/, avoid: /私人会所/, reason: "可按共同兴趣安排艺术参观、街区漫步或自然休闲，避免仅因网红标签作推荐。", checks: "确认彼此的兴趣、预算和步行需求，夜间活动需另核查交通与开放情况。" },
  solo: { label: "独自出游", keywords: "博物馆 城市公园 历史街区", prefer: /博物馆|美术馆|公园|历史|街区/, avoid: /私人会所|野外探险/, reason: "优先考虑公共文化和城市休闲候选，便于按个人节奏调整。", checks: "提前核查开放、返程交通和现场管理；地点类别不构成人身安全保证。" },
} as const;

export type AudienceKey = keyof typeof audienceGuides;
export interface DestinationContext {
  city?: string;
  audiences?: AudienceKey[];
  indoor?: boolean;
  lowWalking?: boolean;
  lowBudget?: boolean;
  childAge?: number;
  topic?: "introduction" | "recommendation";
  focus?: "history" | "food" | "sights";
  lastPlaces?: string[];
}
export interface DestinationPlace { name: string; tag: string; address?: string; source?: string; url?: string }

export function cleanDestinationContext(value: unknown): DestinationContext {
  if (!value || typeof value !== "object") return {};
  const raw = value as DestinationContext;
  return {
    ...(typeof raw.city === "string" && raw.city.length <= 24 ? { city: raw.city } : {}),
    ...(Array.isArray(raw.audiences) ? { audiences: [...new Set(raw.audiences.filter((key) => typeof key === "string" && Object.hasOwn(audienceGuides, key)))].slice(0, 4) } : {}),
    ...(typeof raw.indoor === "boolean" ? { indoor: raw.indoor } : {}),
    ...(typeof raw.lowWalking === "boolean" ? { lowWalking: raw.lowWalking } : {}),
    ...(typeof raw.lowBudget === "boolean" ? { lowBudget: raw.lowBudget } : {}),
    ...(Number.isInteger(raw.childAge) && raw.childAge! >= 0 && raw.childAge! <= 17 ? { childAge: raw.childAge } : {}),
    ...(["introduction", "recommendation"].includes(raw.topic || "") ? { topic: raw.topic } : {}),
    ...(["history", "food", "sights"].includes(raw.focus || "") ? { focus: raw.focus } : {}),
    ...(Array.isArray(raw.lastPlaces) ? { lastPlaces: raw.lastPlaces.filter((name) => typeof name === "string").slice(0, 8).map((name) => name.slice(0, 100)) } : {}),
  };
}

export function destinationPreferences(message: string, previous: DestinationContext): DestinationContext {
  const next = { ...cleanDestinationContext(previous) };
  const audienceText = message.replace(/(?:不带|没有|不是|不考虑)(?:老年人|老人|孩子|儿童|学生|轮椅)/g, "");
  const groups: AudienceKey[] = [];
  if (/亲子|孩子|小孩|小朋友|带娃|儿童|宝宝|孙子|孙女/.test(audienceText)) groups.push("family");
  if (/学生|大学生|研学/.test(audienceText)) groups.push("student");
  if (/老人|老年|长辈|爸妈|父母/.test(audienceText)) groups.push("senior");
  if (/轮椅|无障碍|行动不便/.test(audienceText)) groups.push("accessible");
  if (/成年人|成人|年轻人|普通人群/.test(audienceText)) groups.push("adult");
  if (/情侣|恋人|两口子/.test(audienceText)) groups.push("couple");
  if (/独自|独行|一个人|一人游/.test(audienceText)) groups.push("solo");
  if (/不带孩子|没有孩子/.test(message)) { next.audiences = next.audiences?.filter((key) => key !== "family"); delete next.childAge; }
  if (groups.length) { next.audiences = groups; delete next.focus; if (!groups.includes("family")) delete next.childAge; }
  const age = message.match(/(?:孩子|小孩|宝宝)?\s*([一二两三四五六七八九十\d]{1,2})\s*岁/);
  const digits: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const childAge = age ? /^\d+$/.test(age[1]) ? Number(age[1]) : age[1].startsWith("十") && age[1].length === 2 ? 10 + (digits[age[1][1]] || 0) : digits[age[1]] : undefined;
  if (childAge !== undefined && childAge <= 17) { next.childAge = childAge; if (!groups.length) next.audiences = ["family"]; }
  if (/室内|雨天|下雨/.test(message)) next.indoor = true;
  if (/室外|户外|不下雨|晴天/.test(message)) next.indoor = false;
  if (/少走|走不远|不想走|腿脚|轻松|行动不便|轮椅|不爬山|不想爬|不想登山/.test(message)) next.lowWalking = true;
  if (/能多走|徒步|不怕走/.test(message)) next.lowWalking = false;
  if (/低预算|便宜|省钱|免费|预算不多/.test(message)) next.lowBudget = true;
  if (/不限预算|预算充足/.test(message)) next.lowBudget = false;
  if (/换成|改成|不带孩子|只有老人/.test(message) && !groups.includes("family")) delete next.childAge;
  if (/历史|文化/.test(message)) next.focus = "history";
  if (/美食|吃什么|餐饮|小吃/.test(message)) next.focus = "food";
  if (/景点|去处/.test(message) && !groups.length) next.focus = "sights";
  return next;
}

export function isDestinationFollowup(message: string, context: DestinationContext): boolean {
  if (!context.topic || /来源|出处|依据|从哪|哪里来|哪来的|数据|天气|预报|气温|空气质量|AQI|PM2|重新规划|帮我规划/i.test(message)) return false;
  if (!/如果|假如|要是|雨天/.test(message) && /(?:今天|明天|后天).*(?:下雨|降雨)|会不会.*(?:下雨|降雨)|降雨概率/.test(message)) return false;
  return /亲子|孩子|小孩|小朋友|带娃|\d+岁|学生|老人|老年|爸妈|父母|长辈|情侣|独自|一个人|轮椅|无障碍|雨天|下雨|室内|室外|少走|轻松|预算|便宜|省钱|换成|改成|换一批|还有|具体|历史|文化|美食|吃什么|景点|适合|推荐|去哪|不想|为什么|原因/.test(message);
}

export function destinationRecommendationRequest(message: string): boolean {
  return /不同人群|各类人群|按人群|人群.*推荐|(?:适合|推荐|建议).*(?:去|地方|景点|城市|玩)|(?:亲子|孩子|小朋友|带娃|老人|老年|学生|爸妈|父母|长辈|情侣|独自|一个人|轮椅|无障碍).*(?:去哪|哪里|玩什么|怎么玩|推荐)|(?:去哪|哪里|哪些地方|哪些景点|什么地方).*(?:亲子|老人|孩子|学生|爸妈|情侣|轮椅)|适合.*(?:亲子|学生|老人|老年|孩子|轮椅)/.test(message);
}

export function rankDestinationPlaces(places: DestinationPlace[], context: DestinationContext): Array<DestinationPlace & { reason: string }> {
  const groups = (context.audiences?.length ? context.audiences : ["adult"]) as AudienceKey[];
  const ranked = places.map((place) => {
    const text = `${place.name} ${place.tag}`;
    if (context.indoor && !/博物馆|科技馆|美术馆|展览|文化馆|纪念馆|室内/.test(text)) return null;
    if ((context.lowWalking || groups.some((g) => ["senior", "accessible"].includes(g))) && /登山|山顶|攀岩|漂流|蹦极|骑行|绿道/.test(text)) return null;
    if (groups.some((group) => audienceGuides[group].avoid.test(text))) return null;
    let score = groups.reduce((sum, group) => sum + (audienceGuides[group].prefer.test(text) ? 3 : 0), 0);
    if (score === 0) return null; // Do not claim every retrieved venue suits the audience.
    if (groups.includes("family") && /科技馆|自然|动物/.test(text)) score += context.childAge !== undefined && context.childAge < 6 ? 5 : 3;
    if (groups.includes("student") && /历史|博物馆|文化|遗址/.test(text)) score += 2;
    if (context.lowBudget && /公园|博物馆|街区/.test(text)) score += 1;
    const reason = groups.map((group) => audienceGuides[group].reason).join(" ");
    return { ...place, score, reason };
  }).filter((place) => place !== null);
  return ranked.sort((a, b) => b.score - a.score).slice(0, 4).map(({ score: _score, ...place }) => { void _score; return place; });
}

export function describeDestinationPreferences(context: DestinationContext): string {
  return [context.audiences?.map((key) => audienceGuides[key].label).join("、"), context.childAge !== undefined ? `孩子${context.childAge}岁` : "", context.indoor ? "室内优先" : "", context.lowWalking ? "减少步行" : "", context.lowBudget ? "关注预算（费用待核实）" : ""].filter(Boolean).join(" · ");
}
