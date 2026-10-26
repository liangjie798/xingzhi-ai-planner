"use client";

import { CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { ToolTraceItem } from "@/lib/types";
import { formatDuration } from "@/lib/timing";

gsap.registerPlugin(useGSAP);

export function AgentProgress(props: { items: ToolTraceItem[]; running: boolean; phase?: string }) {
  if(!props.items.length&&!props.running) return null;
  return <MountedAgentProgress {...props} />;
}
function MountedAgentProgress({ items, running, phase }: { items: ToolTraceItem[]; running: boolean; phase?: string }) {
  const pending=items.filter(item=>item.status==="fallback");
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target=root.current?.querySelector(".agent-event:last-child");
    if(target) gsap.fromTo(target, { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: .45, ease: "power2.out" });
  }, { scope: root, dependencies: [items.length], revertOnUpdate: true });
  return <div ref={root} className={`agent-progress ${running ? "is-running" : "is-finished"}`} aria-label="Agent 实时进度">
    <div className="agent-progress-heading"><span className="agent-signal" /><strong>{running ? phase || "Agent 正在执行" : pending.length ? "分析已返回 · 仍有待确认项" : "本轮执行完成"}</strong><small>{items.length}个工具步骤{pending.length ? ` · ${pending.length}个兜底/待确认步骤`:""}</small></div>
    {!running&&pending.length>0&&<p className="progress-pending">{pending.map(item=>item.name).join("、")}：使用规则或仍需核对，不能视为行程已全部验证。</p>}
    <details open={running}><summary>{running?"正在执行工具":"查看步骤、耗时与待确认详情"}</summary><div className="agent-event-track" aria-live="polite">{(running?items.slice(-4):items).map((item) => <div className={`agent-event ${item.status}`} key={item.id}>{item.status === "fallback" ? <WarningCircle size={17} /> : <CheckCircle size={17} weight="fill" />}<details><summary>{item.name}</summary><p>{item.detail}</p></details><time>{formatDuration(item.durationMs)}</time></div>)}
      {running && <div className="agent-event is-active"><CircleNotch size={17} /><span>{phase || "等待下一个工具返回结果…"}</span></div>}
    </div></details>
  </div>;
}
