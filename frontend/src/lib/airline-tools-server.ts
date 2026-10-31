import { searchTrains } from "./train-search-server.ts";
import { AIRLINE_AUDIT_DATE, AIRLINE_AUDIT_REPORT, AIRLINE_CATALOGUE } from "./airline-catalogue.ts";
import { ACTIVE_AIRLINE_CODES } from "./airline-providers.ts";
import { searchAirlineFlights } from "./airline-search-server.ts";
import type { FlightQuery } from "./airline-types.ts";

export const FLIGHT_SEARCH_TOOL = {
  type:"function" as const,
  function:{name:"search_domestic_flights",description:"只读查询已适配的中国大陆航司官网单程1成人展示报价。不是全网最低价；税费、售票条件可能尚未核实。遇登录/验证码停止，不下单、不支付。每次最多3家航司，日期为北京时间今天起90天内。",parameters:{type:"object",additionalProperties:false,required:["origin","destination","date"],properties:{origin:{type:"string",description:"用户确认的出发城市或明确机场名称"},destination:{type:"string",description:"用户确认的目的城市或明确机场名称"},date:{type:"string",pattern:"^\\d{4}-\\d{2}-\\d{2}$"},airlineCodes:{type:"array",items:{type:"string",enum:ACTIVE_AIRLINE_CODES},minItems:1,maxItems:3,description:"可选；仅列适配器支持的航司。未指定时按枢纽选择最多3家，不表示查询了所有航司。"}}}},
};
export const AIRLINE_COVERAGE_TOOL = {type:"function" as const,function:{name:"list_airline_coverage",description:"查看65项民航局目录的逐家测试状态与已注册适配器。样例曾取得报价不等于工具已支持，也不保证当前能查询。",parameters:{type:"object",additionalProperties:false,properties:{}}}};
export const TRAIN_SEARCH_TOOL={type:"function" as const,function:{name:"search_domestic_trains",description:"只读查询12306公开车次、票价与出发到达时间；遇访问限制停止，不购票不支付。",parameters:{type:"object",additionalProperties:false,required:["origin","destination","date"],properties:{origin:{type:"string"},destination:{type:"string"},date:{type:"string"}}}}};
export const AIRLINE_TOOLS=[FLIGHT_SEARCH_TOOL,TRAIN_SEARCH_TOOL,AIRLINE_COVERAGE_TOOL];
export function airlineCoverage(){
  return {auditDate:AIRLINE_AUDIT_DATE,reportUrl:AIRLINE_AUDIT_REPORT,totalEntities:AIRLINE_CATALOGUE.length,sampleQuoteObserved:AIRLINE_CATALOGUE.filter(row=>row.sampleQuoteObserved).length,registeredAdapters:ACTIVE_AIRLINE_CODES,airlines:AIRLINE_CATALOGUE.map(row=>({...row,adapterRegistered:ACTIVE_AIRLINE_CODES.some(code=>code===row.code)})),notes:["目录、历史样例测试和运行时结果分别记录；工具只报告实际返回的价格。","登录、验证及协议受限站点不自动采集；不代表全量航司实时查价已覆盖。"]};
}
export async function executeAirlineTool(name:string,args:unknown,signal?:AbortSignal){
  if(name===TRAIN_SEARCH_TOOL.function.name){const row=args as Record<string,unknown>;if(!row||Array.isArray(row)||Object.keys(row).some(k=>!["origin","destination","date"].includes(k))||![row.origin,row.destination,row.date].every(v=>typeof v==="string"&&v.length>0&&v.length<=30))throw Error("invalid-train-search");return searchTrains(row.origin as string,row.destination as string,row.date as string,signal);}
  if(name===AIRLINE_COVERAGE_TOOL.function.name){if(!args||typeof args!=="object"||Array.isArray(args)||Object.keys(args).length)throw new Error("invalid-tool-arguments");return airlineCoverage();}
  if(name===FLIGHT_SEARCH_TOOL.function.name)return searchAirlineFlights(args as FlightQuery,{signal});
  throw new Error("unknown-agent-tool");
}
