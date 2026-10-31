import type { SocialItem } from "./social-research";

export const cityNames = "北京 上海 天津 重庆 广州 深圳 杭州 成都 武汉 南京 西安 太原 青岛 天水 苏州 厦门 长沙 郑州 洛阳 昆明 贵阳 南宁 海口 三亚 福州 泉州 济南 合肥 南昌 沈阳 大连 长春 哈尔滨 石家庄 呼和浩特 银川 西宁 兰州 乌鲁木齐 拉萨 香港 澳门".split(" ");

/** Recognize a city topic, not every short Chinese noun as a place. */
export function cityIntroductionSubject(message: string): string | undefined {
  const text = message.trim().replace(/[。！!？?]+$/, "");
  const subject = text
    .replace(/^(?:请|能否|可以|帮我|给我|为我)*\s*(?:简单|详细)?(?:介绍|讲讲|说说)(?:一下子|一下)?\s*/, "")
    .replace(/(?:的)?(?:城市介绍|城市简介|城市概况|简介|概况|介绍|是个什么样的城市)$/, "").trim();
  const known = cityNames.find((name) => subject === name || subject === `${name}市` || subject === `${name}特别行政区`);
  if (known) return known;
  return /^[\u4e00-\u9fa5]{2,10}(?:市|县|区)$/.test(subject) && !/社区|景区|地区$/.test(subject) ? subject : undefined;
}

/** Unknown short topics are only candidates: the server must validate them as administrative places. */
export function candidateCityTopic(message: string): string | undefined {
  const known = cityIntroductionSubject(message);
  if (known) return known;
  const text = message.trim().replace(/[。！!？?]+$/, "").replace(/^(?:请|帮我|给我)?(?:简单|详细)?介绍(?:一下)?/, "").replace(/(?:的)?(?:城市简介|城市概况|简介|概况)$/, "");
  return /^[\u4e00-\u9fa5]{2,6}$/.test(text) && !/天气|推荐|规划|路线|什么|怎么|数据|来源|谢谢|你好|预算|人群|学生|老人|亲子|孩子|轮椅|室内|室外|雨天|下雨|晴天|准备|历史|美食|景点|具体|还有|解释|原因|为什么|年龄|适合|知识|假期|五一|春节|国庆|换|改成|岁|少走|轻松|便宜|省钱|普通|独自|一个人|情侣|爸妈|父母|长辈|好的|可以/.test(text) ? text : undefined;
}

export function cityInDestinationQuestion(message: string): string | undefined {
  const known = cityNames.flatMap((name) => { const index = message.indexOf(name); return index < 0 ? [] : [{ name, index }]; }).sort((a, b) => b.index - a.index)[0];
  if (known) return known.name;
  const named = message.match(/(?:^|在|去|到|介绍)([\u4e00-\u9fa5]{2,8}?(?:市|县|区))(?=的|适合|有|带|亲子|老人|学生|推荐|[，。\s]|$)/);
  const text = message.replace(/有哪些|有什么/g, "");
  const embedded = text.match(/(?:在|去|到)([\u4e00-\u9fa5]{2,6}?)(?=玩|旅游|旅行|适合|带|亲子|推荐)/)
    || text.match(/^([\u4e00-\u9fa5]{2,6}?)(?=推荐|适合|亲子|老人|带老人|带孩子|带娃)/);
  const candidate = named?.[1] || embedded?.[1];
  return candidate && !/带|换成|改成|岁|孩子|老人|父母|亲子|推荐|适合|哪些|什么|雨天/.test(candidate) ? candidate : undefined;
}

export function regionalCitySources(items: SocialItem[], city: string, province: string): SocialItem[] {
  const name = city.replace(/(?:特别行政区|市|县|区)$/, "");
  return items.filter((item) => {
    const text = `${item.title} ${item.excerpt}`;
    if (!text.includes(name)) return false;
    const foreign = /(?:位于|地处|隶属|属于)[^。]{0,35}(?:马来西亚|印度尼西亚|美国|加拿大|澳大利亚|英国|法国|日本|韩国|泰国|新加坡)|Teluk Intan|Perak|Malaysia/i;
    if (foreign.test(text)) return false;
    return !/马来西亚|Malaysia/i.test(text) || text.includes(province.replace(/省$/, ""));
  });
}

/** Stable editorial profiles; omit prices, rankings and opening hours. */
export const cityProfiles: Record<string, { reply: string; sources: Array<{ title: string; url: string }> }> = {
  西安: {
    reply: "西安｜从长安古都认识这座城\n\n西安是陕西省省会，位于关中平原中部，古称长安。它的城市特色，可以从古都历史、文物遗址和日常饮食三个方面认识。[1]\n\n历史与文化\n长安文化是了解西安的重要线索。来到这里，既可以通过历史遗址和博物馆认识秦汉隋唐文化，也可以沿城墙和老城街巷观察今天的城市生活。\n\n代表景点\n想了解秦代历史，可以关注临潼的秦始皇帝陵博物院（兵马俑）；想感受古城空间，可以了解西安城墙和碑林；对唐代文化感兴趣，可以从大雁塔一带开始，也可把陕西历史博物馆作为了解历史的入口。[2]\n\n特色美食\n牛羊肉泡馍、肉夹馍和凉皮，都是认识西安饮食的常见选择。可以根据自己的口味和饮食禁忌挑选，不必只追逐热门店铺。[3]\n\n初次到访的建议\n建议把历史文化、城市漫步和当地饮食结合起来，按片区安排，给参观和休息留足时间。景区预约、票价和开放情况需在出发前核实。\n\n你想接着了解西安的历史、景点、美食，还是让我帮你安排一次旅行？",
    sources: [
      { title: "西安市人民政府 · 市情简介", url: "https://www.xa.gov.cn/sq/csgk/sqjj/1.html" },
      { title: "西安市文化和旅游局 · 旅游景区", url: "https://wlj.xa.gov.cn/wlml/lyjq/1.html" },
      { title: "空军工程大学 · 西安饮食特色", url: "https://www.afeu.edu.cn/xayx/ysts.htm" },
    ],
  },
};

export function cityIntroductionQuery(city: string) {
  return `${city} 城市简介 地理位置 历史文化 代表景点 特色美食`;
}

export function selectCityIntroductionSources(items: SocialItem[], city: string): SocialItem[] {
  const name = city.replace(/(?:特别行政区|市|县|区)$/, "");
  const seen = new Set<string>();
  return items.filter((item) => {
    const title = item.title.replace(/\s/g, "");
    if (!title.includes(name) || /街|景区|景点|公园|博物馆|酒店|餐厅/.test(title)) return false;
    // A city's name in a topical news article does not make it a city overview.
    const cityAt = title.indexOf(name);
    const subject = title.slice(cityAt + name.length).replace(/^市(?!情)/, "");
    if (!/^(?:城市)?(?:简介|介绍|概况|概览|市情|基本情况|地理概况|历史沿革|饮食文化|特色美食)/.test(subject)
      && !/^(?:市情|城市)(?:简介|概况|概览)[：:·—-]?/.test(title)) return false;
    if (seen.has(item.url) || seen.has(item.excerpt)) return false;
    seen.add(item.url); seen.add(item.excerpt);
    return true;
  }).slice(0, 5);
}
