import { runAirlineAgent } from "./airline-agent-server.ts";
import type { ClientModelConfig } from "./llm-server.ts";
import type { AirlineCode } from "./airline-types.ts";
import type { TicketOption, TicketSearchResult } from "./ticket-types";

export function summarizeTickets(options:TicketOption[],notes:string[]){
  const valid=options.filter(option=>Number.isFinite(option.price)&&option.price>0);
  if(!valid.length)return `本次未取得可核实的航司官网报价，不能判断哪种出行方式更便宜。${notes.join("\n")}`;
  const lines=valid.slice(0,6).map(option=>`${option.service}：官网展示 ¥${option.price}/人（${option.seat}${option.departure?`，${option.departure}–${option.arrival||"待核验"}${option.arrivalDayOffset?`，到达为起飞后第${option.arrivalDayOffset}天`:""}`:""}${option.sourceName?`，${option.sourceName}`:""}）`);
  return `取得${valid.length}条官网展示报价，以下列出部分候选：\n${lines.join("\n")}\n税费口径及最终支付金额尚未全部核实，不能据此判断含税最低价，也尚不能判断航班比火车更便宜。\n${notes.join("\n")}`;
}

export async function searchTickets(origin:string,destination:string,date:string,options:{signal?:AbortSignal;config?:ClientModelConfig;useModel?:boolean;airlineCodes?:AirlineCode[];mode?:"航班"|"火车"}={}):Promise<TicketSearchResult>{
  if(options.mode==="火车")return {origin,destination,date,checkedAt:new Date().toISOString(),status:"unavailable",options:[],notes:["火车票请前往12306官网查询，本工具未取得火车实时报价。"],reply:"火车票请前往12306官网查询。本工具未取得火车实时报价，不能判断火车与航班哪种更便宜。"};
  const agent=await runAirlineAgent({origin,destination,date,...(options.airlineCodes?{airlineCodes:options.airlineCodes}:{})},options);
  const result=agent.result;
  const quotes:TicketOption[]=result.quotes.map(quote=>({mode:"航班",service:quote.flightNumber,optionId:`${quote.airlineCode}:${quote.flightNumber}:${quote.date}:${quote.departure}`,seat:quote.cabin,price:quote.price,departure:quote.departure,arrival:quote.arrival,arrivalDayOffset:quote.arrivalDayOffset,originStation:quote.originStation,destinationStation:quote.destinationStation,sourceName:quote.sourceName,sourceUrl:quote.sourceUrl,checkedAt:quote.checkedAt,priceBasis:quote.priceBasis,stops:quote.stops,codeshare:quote.codeshare,operatingFlightNumber:quote.operatingFlightNumber}));
  return {origin,destination,date,checkedAt:result.checkedAt,status:result.status,options:quotes,notes:result.notes,providers:result.providers,reply:summarizeTickets(quotes,result.notes),modelCall:agent.modelCall,toolCalls:agent.toolCall?[agent.toolCall]:[]};
}
