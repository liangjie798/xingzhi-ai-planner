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
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target=root.current?.querySelector(".agent-event:last-child");
    if(target) gsap.fromTo(target, { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: .45, ease: "power2.out" });
  }, { scope: root, dependencies: [items.length], revertOnUpdate: true });
  return <div ref={root} className={`agent-progress ${running ? "is-running" : "is-finished"}`} aria-label="Agent 实时进度">
    <div className="agent-progress-heading"><span className="agent-signal" /><strong>{running ? phase || "Agent 正在执行" : "本轮执行完成"}</strong><small>{items.length} 条真实工具记录</small></div>
    <div className="agent-event-track" aria-live="polite">{items.slice(-4).map((item) => <div className={`agent-event ${item.status}`} key={item.id}>{item.status === "fallback" ? <WarningCircle size={17} /> : <CheckCircle size={17} weight="fill" />}<span>{item.detail || item.name}</span><time>{formatDuration(item.durationMs)}</time></div>)}
      {running && <div className="agent-event is-active"><CircleNotch size={17} /><span>{phase || "等待下一个工具返回结果…"}</span></div>}
    </div>
  </div>;
}
