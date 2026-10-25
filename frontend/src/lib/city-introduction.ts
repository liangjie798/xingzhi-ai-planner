import type { SocialItem } from "./social-research";

const cityNames = "北京 上海 天津 重庆 广州 深圳 杭州 成都 武汉 南京 西安 太原 青岛 天水 苏州 厦门 长沙 郑州 洛阳 昆明 贵阳 南宁 海口 三亚 福州 泉州 济南 合肥 南昌 沈阳 大连 长春 哈尔滨 石家庄 呼和浩特 银川 西宁 兰州 乌鲁木齐 拉萨 香港 澳门".split(" ");

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
  return items.filter((item) => `${item.title} ${item.excerpt}`.includes(name)
    && (/简介|概况|城市介绍|历史文化|旅游景点|特色美食|游览指南/.test(item.title)
      || (item.excerpt.includes(name) && /位于|地处|古称|省会|古都/.test(item.excerpt))))
    .slice(0, 5);
}
