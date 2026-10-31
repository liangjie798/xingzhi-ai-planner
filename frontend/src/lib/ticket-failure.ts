import { AIRLINE_STATE_LABELS } from "./airline-search-server.ts";
import type { AirlineState } from "./airline-types.ts";
/** Only bounded classifications reach users. Never return browser logs, URLs or credentials. */
export function ticketFailureNote(error:unknown,mode:string){
  const code=error instanceof Error?error.message:"";
  const reason=Object.hasOwn(AIRLINE_STATE_LABELS,code)?AIRLINE_STATE_LABELS[code as AirlineState]:error instanceof Error&&["TimeoutError","AbortError"].includes(error.name)?"查询超时或已取消，请稍后重试":"未取得可核实的官网报价，请稍后重试";
  return `${mode}：${reason}。`;
}
