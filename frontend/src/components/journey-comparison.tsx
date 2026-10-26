"use client";
import { useRef, useState } from "react";
import type { ActivityInput } from "@/lib/types";
import type { TicketSearchResult } from "@/lib/ticket-types";

export function JourneyComparison({input,onConditions,expanded,onToggle,answer}:{input:ActivityInput;onConditions:(patch:Partial<ActivityInput>)=>void;expanded:boolean;onToggle:(open:boolean)=>void;answer:TicketSearchResult|null}) {
  const origin=input.originCity || "",destination=input.journeyDestination || "",date=input.departureDate || "";
  const [result,setResult]=useState<TicketSearchResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const sequence=useRef(0);
  const matching=(value:TicketSearchResult|null)=>value?.origin===origin&&value?.destination===destination&&value?.date===date ? value : null;
  const shown=[matching(result),matching(answer)].filter((value):value is TicketSearchResult=>Boolean(value)).sort((a,b)=>b.checkedAt.localeCompare(a.checkedAt))[0];
  async function search(){
    const id=++sequence.current;
    setBusy(true);setError("");setResult(null);
    try {
      const response=await fetch("/journey-search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({origin,destination,date})});
      if(!response.ok)throw new Error("查价暂不可用，请稍后重试。");
      const value=await response.json() as TicketSearchResult;
      if(sequence.current===id)setResult(value);
    }catch{if(sequence.current===id)setError("查价暂不可用，请稍后重试。");}
    finally{if(sequence.current===id)setBusy(false);}
  }
  return <details className="journey-comparison" open={expanded} onToggle={event=>onToggle(event.currentTarget.open)}><summary>怎么去更便宜 · 自动查票价</summary>
    <p>填三个条件，自动查火车与航班。也可以直接问：“西安到榆林，明天怎么走便宜？”</p>
    <form className="journey-simple-form" onSubmit={event=>{event.preventDefault();void search();}}>
      <label>出发地<input required aria-label="交通出发地" value={origin} maxLength={20} placeholder="西安" onChange={event=>onConditions({originCity:event.target.value})}/></label>
      <label>目的地<input required aria-label="交通目的地" value={destination} maxLength={20} placeholder="榆林" onChange={event=>onConditions({journeyDestination:event.target.value})}/></label>
      <label>出发日期<input required aria-label="交通出发日期" type="date" value={date} onChange={event=>onConditions({departureDate:event.target.value})}/></label>
      <button type="submit" disabled={busy||!origin.trim()||!destination.trim()||!date}>{busy?"正在查价…":"查询低价出行"}</button>
    </form>
    {error&&<p role="alert">{error}</p>}
    {shown&&<div className="journey-result" aria-live="polite"><p style={{whiteSpace:"pre-line"}}>{shown.reply}</p>{shown.options.length>0&&<><small>查询时间：{new Date(shown.checkedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}（北京时间）</small><div className="journey-ticket-list">{shown.options.map((item,index)=><article key={index}><strong>{item.mode} · ¥{item.price}/人</strong><span>{item.service} · {item.seat}</span></article>)}</div></>}</div>}
    <nav className="journey-sources" aria-label="票价查询来源"><a href="https://www.12306.cn/index/" target="_blank" rel="noopener noreferrer">12306购票 ↗</a><a href="https://www.variflight.com/" target="_blank" rel="noopener noreferrer">飞常准 ↗</a></nav>
  </details>;
}
