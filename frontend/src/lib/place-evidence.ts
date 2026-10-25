import type { EvidenceItem } from "./types";

// Reviewed primary sources support place identity and cultural themes, not live
// prices, opening hours, group capacity or a promise of admission.
const sources = [
  { city:"西安", names:["兵马俑","秦始皇帝陵博物院","秦始皇兵马俑"], title:"秦始皇帝陵博物院 · 官方参观指南", publisher:"秦始皇帝陵博物院", url:"https://www.bmy.com.cn/jingtai/bmyweb/ticketing.html", text:"支持秦代历史参观主题与实名预约核对；票务和开放安排以官网最新公告为准。" },
  { city:"西安", names:["陕西历史博物馆"], title:"陕西历史博物馆 · 参观导览", publisher:"陕西历史博物馆", url:"https://www.sxhm.com/guide.h", text:"支持历史文物参观主题，提供官方参观、预约与交通信息入口。" },
  { city:"西安", names:["西安城墙"], title:"西安城墙 · 历史文化介绍", publisher:"西安曲江新区管理委员会", url:"https://qjxq.xa.gov.cn/zjqj/qyts/5df21c3a65cbd81235fc1bf1.html", text:"支持古城空间、城垣文化与历史观察的推荐主题。" },
  { city:"西安", names:["大唐不夜城"], title:"大唐不夜城 · 街区文化体验", publisher:"西安曲江新区管理委员会", url:"https://qjxq.xa.gov.cn/xwzx/xwdt/2034208842507739138.html", text:"支持唐文化街区及文化体验的推荐主题，不代表实时演出或营业安排。" },
  { city:"西安", names:["大雁塔","大唐芙蓉园","华清宫","大明宫","碑林","半坡","西安博物院","汉城湖"], title:"西安市旅游景区名录", publisher:"西安市文化和旅游局", url:"https://wlj.xa.gov.cn/wlml/lyjq/1.html", text:"支持地点名称、景区身份及所在区域的核对；不证明团体接待能力。" },
  { city:"北京", names:["故宫","天坛","颐和园","恭王府","圆明园","八达岭","慕田峪","奥林匹克"], title:"北京市旅游景区与官方服务入口", publisher:"北京市文化和旅游局", url:"https://whlyj.beijing.gov.cn/ggfw/ly/202511/t20251119_4287815.html", text:"支持景区身份与官方参观信息入口的核对。" },
  { city:"北京", names:["颐和园"], title:"颐和园 · 园林科普基地", publisher:"北京市园林绿化局", url:"https://yllhj.beijing.gov.cn/ztxx/kpjd/202312/t20231222_3508035.shtml", text:"支持园林生态、历史名园与科普观察的活动主题。" },
  { city:"杭州", names:["灵隐","飞来峰"], title:"灵隐飞来峰 · 文旅介绍", publisher:"杭州市文化广电旅游局", url:"https://wgly.hangzhou.gov.cn/art/2023/12/1/art_1229734028_58951314.html", text:"支持历史文化、石刻艺术及景区位置的核对。" },
  { city:"杭州", names:["西湖","断桥","西溪","雷峰塔","灵隐"], title:"杭州官方文化旅游线路", publisher:"杭州市文化广电旅游局", url:"https://wgly.hangzhou.gov.cn/module/download/downfile.jsp?classid=0&filename=c3ccb4250d3143a09047ee20fbe1170c.pdf", text:"支持文化游览主题与线路参考；行程时点需结合当日天气与预约确认。" },
];
const normalized = (value:string) => value.replace(/[\s·—\-（）()]/g, "");
export function officialPlaceEvidence(city:string, places:string[]):EvidenceItem[] {
  return sources.filter(source=>city.includes(source.city)).flatMap(source=>{
    const relatedPlaces = places.filter(place=>source.names.some(name=>normalized(place).includes(normalized(name))));
    return relatedPlaces.length ? [{ id:`place-${source.url}`, title:source.title, publisher:source.publisher, excerpt:source.text, tag:"官方地点资料", sourceUrl:source.url, relatedPlaces, verification:"官方资料 · 来源目录核对于 2026-10-25；动态信息请查原文" }] : [];
  });
}
export function matchedSearchEvidence(city:string, places:string[], rows:Array<{title:string;excerpt:string;url:string;retrievedAt:string;provider?:string}>):EvidenceItem[] {
  const cityTerm = city.replace(/市$/, "");
  return rows.flatMap(row=>{
    const text = normalized(row.title + row.excerpt);
    const relatedPlaces = places.filter(place=>text.includes(normalized(place)));
    let url:URL;
    try { url = new URL(row.url); } catch { return []; }
    if (url.protocol !== "https:" || url.username || url.password || !text.includes(normalized(cityTerm)) || !relatedPlaces.length || /旅行社|招商|招标|加盟|TOP\s*\d|主营|名额抢购/i.test(row.title)) return [];
    return [{ id:`place-${row.url}`, title:row.title, publisher:row.provider || "联网检索", excerpt:row.excerpt, tag:"地点检索摘要", sourceUrl:row.url, relatedPlaces, retrievedAt:row.retrievedAt, verification:"搜索摘要 · 尚未核验全文，不证明营业或预约状态" }];
  });
}
export function mergePlaceEvidence(items:EvidenceItem[]):EvidenceItem[] {
  const merged:EvidenceItem[] = [];
  for (const item of items) {
    const previous = item.sourceUrl && merged.find(row=>row.sourceUrl === item.sourceUrl);
    if (previous) previous.relatedPlaces = [...new Set([...(previous.relatedPlaces || []), ...(item.relatedPlaces || [])])];
    else merged.push({...item, relatedPlaces:item.relatedPlaces ? [...item.relatedPlaces] : undefined});
  }
  return merged;
}
