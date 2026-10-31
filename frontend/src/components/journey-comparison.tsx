"use client";
import { useEffect, useRef, useState } from "react";
import type { ActivityInput } from "@/lib/types";
import type { TicketSearchResult } from "@/lib/ticket-types";

export function JourneyComparison({input,onConditions,expanded,onToggle,answer}:{input:ActivityInput;onConditions:(patch:Partial<ActivityInput>)=>void;expanded:boolean;onToggle:(open:boolean)=>void;answer:TicketSearchResult|null}) {
  const origin=input.originCity || "",destination=input.journeyDestination || "",date=input.departureDate || "";
  const [result,setResult]=useState<TicketSearchResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const sequence=useRef(0);
  const pending=useRef<AbortController|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  const matching=(value:TicketSearchResult|null)=>value?.origin===origin&&value?.destination===destination&&value?.date===date ? value : null;
  const shown=[matching(result),matching(answer)].filter((value):value is TicketSearchResult=>Boolean(value)).sort((a,b)=>b.checkedAt.localeCompare(a.checkedAt))[0];
  const time=(value?:string)=>value?.match(/(?:^|[T ])(\d{2}:\d{2})/)?.[1] || "";
  async function search(){
    const id=++sequence.current;
    pending.current?.abort();
    const controller=new AbortController();pending.current=controller;
    setBusy(true);setError("");setResult(null);
    try {
      const response=await fetch("/journey-search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({origin,destination,date}),signal:controller.signal});
      if(!response.ok)throw new Error("查价暂不可用，请稍后重试。");
      const value=await response.json() as TicketSearchResult;
      if(sequence.current===id)setResult(value);
    }catch(error){if(sequence.current===id&&!(error instanceof Error&&error.name==="AbortError"))setError("查价暂不可用，请稍后重试。");}
    finally{if(sequence.current===id)setBusy(false);}
  }
  return <details className="journey-comparison" open={expanded} onToggle={event=>onToggle(event.currentTarget.open)}><summary>航司机票查询 · 官网展示价</summary>
    <p>填写出发地、目的地和日期，查询已接入航司官网。报价范围和未查到的原因会单独说明；火车票请前往12306查询。</p>
    <form className="journey-simple-form" onSubmit={event=>{event.preventDefault();void search();}}>
      <label>出发地<input required aria-label="交通出发地" value={origin} maxLength={20} placeholder="西安" onChange={event=>onConditions({originCity:event.target.value})}/></label>
      <label>目的地<input required aria-label="交通目的地" value={destination} maxLength={20} placeholder="榆林" onChange={event=>onConditions({journeyDestination:event.target.value})}/></label>
      <label>出发日期<input required aria-label="交通出发日期" type="date" value={date} onChange={event=>onConditions({departureDate:event.target.value})}/></label>
      <button type="submit" disabled={busy||!origin.trim()||!destination.trim()||!date}>{busy?"正在查询航司官网…":"查询机票展示价"}</button>
    </form>
    {error&&<p role="alert">{error}</p>}
    {shown&&<div className="journey-result" aria-live="polite"><p style={{whiteSpace:"pre-line"}}>{shown.reply}</p>{shown.options.length>0&&<><small>查询完成：{new Date(shown.checkedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}（北京时间，同条件结果最多复用1分钟）</small><div className="journey-ticket-list">{shown.options.map((item,index)=><article key={item.optionId||index}><strong>{item.mode} · 官网展示 ¥{item.price}/人</strong><span>{item.service} · {item.seat} · {item.priceBasis==="total"?"含税":item.priceBasis==="base-fare"?"不含税":"税费待核验"}{item.originStation?` · ${item.originStation} → ${item.destinationStation || destination}`:""}{item.departure?` · ${time(item.departure)}–${time(item.arrival)}${item.arrivalDayOffset?` +${item.arrivalDayOffset}天`:""}`:""}{item.codeshare?" · 代码共享":""}{item.stops===0?" · 直达":item.stops?" · 经停/中转":" · 经停信息待核验"}</span>{item.sourceUrl&&/^https:\/\//.test(item.sourceUrl)&&<a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.sourceName||"航司"}官网核实 ↗</a>}</article>)}</div></>}</div>}
    <nav className="journey-sources" aria-label="票价查询来源"><a href="https://www.12306.cn/index/" target="_blank" rel="noopener noreferrer">12306查询火车票 ↗</a><a href="https://github.com/liangjie798/xingzhi-ai-planner-qa/tree/main/reports/airlines-20261030" target="_blank" rel="noopener noreferrer">航司实测覆盖说明 ↗</a></nav>
  </details>;
}
