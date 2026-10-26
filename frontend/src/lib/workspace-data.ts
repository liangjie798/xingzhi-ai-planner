import type { ActivityInput,DecisionResult,TourismRoute } from "./types";
import type { ExecutionEvent,CostItem } from "./scenario-plans";
import type { JourneyQuote } from "./journey";
export interface SavedPlan {id:string;createdAt:string;label:string;input:ActivityInput;result:DecisionResult|null;route:TourismRoute|null;archived?:boolean;review?:string}
export interface Material {id:string;title:string;url:string;note:string;status:"待确认"|"已人工核对";updatedAt:string}
export interface WorkspaceData {journeyParticipants?:number;journeyTimeValue?:number;journeyQuotes?:JourneyQuote[];events:ExecutionEvent[];costs:Array<CostItem&{placeName?:string;planKey?:string}>;materials:Material[];plans:SavedPlan[]}
export const emptyWorkspace:WorkspaceData={events:[],costs:[],materials:[],plans:[]};
export function planChanges(a:SavedPlan,b:SavedPlan):string[] {
  const fields:[keyof ActivityInput,string][]=[["cityName","城市"],["date","开始日期"],["endDate","结束日期"],["participants","人数"],["audienceDescription","参与者"],["group","风险人群"],["duration","时长"],["intensity","强度"],["budgetPerPerson","人均预算"],["allowedStartHour","时段开始"],["allowedEndHour","时段结束"]];
  const changes=fields.filter(([key])=>a.input[key]!==b.input[key]).map(([key,label])=>`${label}：${a.input[key] ?? "未确认"} → ${b.input[key] ?? "未确认"}`);
  if(a.result?.overallScore!==b.result?.overallScore)changes.push(`适宜度：${a.result?.overallScore ?? "无"} → ${b.result?.overallScore ?? "无"}`);
  const old=a.route?.stops.map(stop=>`${stop.date} ${stop.time} ${stop.name}`).join("；");const next=b.route?.stops.map(stop=>`${stop.date} ${stop.time} ${stop.name}`).join("；");
  if(old!==next)changes.push(`行程更新：${a.route?.stops.length ?? 0}站 → ${b.route?.stops.length ?? 0}站；请查看完整时间表。`);
  return changes.length?changes:["已确认条件与行程未变化，可查看执行记录及资料更新。"];
}
