export function isTransportQuestion(text:string) {
  return /高铁|动车|航班|飞机|火车|机票|票价|怎么去|如何去|怎么走|如何走/.test(text) && !/研学.*任务|体育课|运动会|天气|气温/.test(text)
    || /(?:到|去|前往).+(?:便宜|省钱|划算|性价比)/.test(text);
}
export function journeyLocations(text:string):{originCity?:string;destination?:string} {
  const stop="(?=出发|前往|去|到|明天|后天|今天|未来|[，。；！？\\s]|$)";
  const origin=text.match(new RegExp(`(?:从|出发地(?:是|为|：|:)?|出发城市(?:是|为|：|:)?)\\s*([\\u4e00-\\u9fa5]{2,18}?)${stop}`));
  const route=text.match(/(?:从|^)\s*([\u4e00-\u9fa5]{2,18}?)(?:出发)?(?:[，,\s]*)(?:去|到|前往)\s*([\u4e00-\u9fa5]{2,18}?)(?=明天|后天|今天|出发|[一二两三四五六七八九十\d]+[日天号]|旅游|旅行|怎么|如何|坐|高铁|航班|飞机|哪个|哪种|[，。；！？\s]|$)/);
  const destination=text.match(/(?:目的地(?:是|为|：|:)?|想去|前往)\s*([\u4e00-\u9fa5]{2,18}?)(?=明天|后天|今天|出发|旅游|旅行|[，。；！？\s]|$)/);
  const clean=(value?:string)=>value&&!/明天|后天|今天|天气|出发地|哪里|哪个|怎么|如何/.test(value)?value:undefined;
  return {originCity:clean(route?.[1]||origin?.[1]),destination:clean(route?.[2]||destination?.[1])};
}
export interface JourneyQuote {
  id:string;mode:"高铁"|"航班";origin:string;destination:string;date:string;
  fare:number;extraFees:number;groundCost:number;lineMinutes:number;groundMinutes:number;bufferMinutes:number;
  sourceUrl?:string;recordedAt:string;
}
export function compareJourney(quotes:JourneyQuote[],origin:string,destination:string,date:string,participants:number,timeValue:number) {
  const clean=(value:string)=>value.trim().replace(/市$/,"");
  const valid=quotes.filter(quote=>quote&&typeof quote.origin==="string"&&typeof quote.destination==="string"&&["高铁","航班"].includes(quote.mode)&&origin.trim()&&destination.trim()&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&clean(quote.origin)===clean(origin)&&clean(quote.destination)===clean(destination)&&quote.date===date&&[quote.fare,quote.extraFees,quote.groundCost,quote.lineMinutes,quote.groundMinutes,quote.bufferMinutes].every(value=>Number.isFinite(value)&&value>=0)&&quote.lineMinutes>0);
  const rows=valid.map(quote=>{const cost=Math.round((quote.fare+quote.extraFees+quote.groundCost)*100)/100;const minutes=quote.lineMinutes+quote.groundMinutes+quote.bufferMinutes;return {...quote,cost,minutes,totalCost:Math.round(cost*Math.max(1,participants)*100)/100,valueCost:Math.round((cost+minutes/60*Math.max(0,timeValue))*100)/100};});
  const comparable=rows.some(row=>row.mode==="高铁")&&rows.some(row=>row.mode==="航班");
  const by=(key:"cost"|"minutes"|"valueCost")=>comparable?[...rows].sort((a,b)=>a[key]-b[key])[0]:undefined;
  return {rows,comparable,cheapest:by("cost"),fastest:by("minutes"),recommended:by("valueCost")};
}
