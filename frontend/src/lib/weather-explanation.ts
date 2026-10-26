/** Reviewed general mechanisms, never a diagnosis of a particular weather episode. */
export function explainRain(message: string, today: string, contextCity?: string) {
  if (!/(为什么|为何|怎么|原因|成因)/.test(message) || !/(雨|降水|阴雨)/.test(message)) return null;
  const month = Number(today.slice(5, 7));
  const namedCity = message.match(/(西安|成都|重庆|北京|上海|杭州|广州|深圳|武汉|南京|郑州|长沙|昆明|贵阳|兰州|银川|天津|太原|青岛|榆林)/)?.[1];
  const subject = message.match(/^(?:请问)?(?:最近|近期|这几天|这段时间|现在)?([\u4e00-\u9fa5]{2,12}?)(?:的)?(?:为什么|为何|怎么)/)?.[1];
  const explicitCity = namedCity || (subject && !/下雨|降水|阴雨|天气|最近|这里|这儿|当地|一直|总是/.test(subject) ? subject : undefined);
  const city = explicitCity || contextCity;
  const autumn = /秋|九月|十月|十一月|9月|10月|11月/.test(message) || !/春|夏|冬/.test(message) && month >= 9 && month <= 11;
  const westernAutumn = autumn && city && /西安|成都|重庆|贵阳/.test(city);
  return {
    reply: westernAutumn
      ? `${city}秋季反复阴雨，可以先从“华西秋雨”的一般机制理解：偏南气流输送暖湿水汽，南下冷空气与它交汇，使空气抬升、冷却凝结；当交汇区移动缓慢或反复建立，阴雨就容易持续。地形还会影响气流移动和抬升。[1]\n\n但这只能解释常见原因。本次尚未核实${city}近期的官方天气过程分析和降雨统计，不能据此确认这一轮降雨的具体成因，或断言比往年更多。是否偏多、何时结束，需要当地气象台的最新实况和预报。`
      : `${city ? `${city}的` : ""}连续降雨通常需要水汽供应、空气抬升，以及天气系统持续或反复影响共同作用；不同季节和地区的具体系统并不相同。秋季华西地区的连阴雨，是冷暖空气交汇的一类例子。[1]\n\n本次尚未核实${city || "当地"}近期的官方天气过程分析，不能仅凭“雨多”确认具体原因，也不能断言降雨异常或何时结束。`,
    kind: "降雨原因说明",
    sources: [{ title: "中国天气网 · 华西秋雨成因及特点", url: "https://www.weather.com.cn/zt/ty/1090146.shtml", detail: "气象科普：支持一般机制，不是本次天气过程的实况分析" }],
  };
}

export function forecastRangeReply(city: string, date: string, today: string, end: string, previous: string) {
  const repeated = previous.includes(date) && /当前可查询|当前预报覆盖|超出.*范围/.test(previous);
  return repeated
    ? `${city} ${date} 仍超出当前预报范围（${today} 至 ${end}），暂时无法提供可靠预报。可以临近该日期时再查。`
    : `${city} · ${date}\n当前预报覆盖 ${today} 至 ${end}（北京时间），该日期不在范围内，暂时无法提供可靠天气。可以查询范围内的日期，或临近该日期时再查。`;
}
