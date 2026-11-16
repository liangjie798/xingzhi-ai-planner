"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import s from "./travel-illustration.module.css";

gsap.registerPlugin(useGSAP);

/** Original vector artwork. Motion is decorative, never a data/loading signal. */
export function TravelIllustration({ compact = false }: { compact?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const loop = gsap.timeline({ paused: true, defaults: { ease: "power2.inOut" } });
      loop.to("[data-cloud]", { x: compact ? 18 : 40, y: -4, duration: 5, stagger: .6, yoyo: true, repeat: -1 }, 0)
        .to("[data-plane]", { x: compact ? 34 : 65, y: -20, rotation: -8, duration: 3.5, yoyo: true, repeat: -1 }, 0)
        .to("[data-sun]", { scale: 1.12, transformOrigin: "center", opacity: .75, duration: 4, yoyo: true, repeat: -1 }, 0)
        .to("[data-halo]", { scale: 1.18, transformOrigin: "center", opacity: .35, duration: 3, yoyo: true, repeat: -1 }, 0)
        .to("[data-mote]", { y: -10, opacity: .25, duration: 2.4, stagger: .7, yoyo: true, repeat: -1 }, 0)
        .to("[data-route-light]", {
          keyframes: compact
            ? [{ x: 40, y: -22, duration: 1.5 }, { x: 84, y: -6, duration: 1.5 }, { x: 125, y: -36, duration: 1.5 }, { x: 170, y: -55, duration: 1.5 }, { x: 204, y: -53, duration: 1.5 }]
            : [{ x: 110, y: -65, duration: 1.5 }, { x: 230, y: -81, duration: 1.5 }, { x: 326, y: -110, duration: 1.5 }, { x: 460, y: -170, duration: 1.5 }, { x: 595, y: -170, duration: 1.5 }],
          repeat: -1, yoyo: true,
        }, 0);
      if (!compact) loop.to("[data-train]", { x: 240, duration: 7, yoyo: true, repeat: -1 }, 0);

      let visible = false;
      const sync = () => { if (visible && !document.hidden) loop.play(); else loop.pause(); };
      const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: .1 });
      if (root.current) observer.observe(root.current);
      document.addEventListener("visibilitychange", sync);
      return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); };
    });
    return () => media.revert();
  }, { scope: root, dependencies: [compact], revertOnUpdate: true });

  return <div ref={root} className={`${s.art} ${compact ? s.compact : s.scene}`} data-travel-art>
    <svg viewBox={compact ? "0 0 240 120" : "0 0 720 520"} fill="none" aria-hidden="true" focusable="false">
      {compact ? <>
        <path d="M8 92 64 30l48 45 33-24 84 53" stroke="#766956" strokeWidth="1.5" />
        <path d="M20 106c41-52 69 10 105-16s50-55 99-37" stroke="#dfb479" strokeWidth="1.5" strokeDasharray="3 6" />
        <circle data-sun cx="176" cy="28" r="16" fill="#805624" />
        <circle data-halo cx="176" cy="28" r="23" stroke="#766956" />
        <g data-cloud stroke="#b9aa96" strokeWidth="1.5"><path d="M36 27h40m-30-8h20" /></g>
        <g data-plane transform="translate(126 50)"><path d="m0 0 28-8-10 10-3 12-5-10Z" fill="#dfb479" /><path d="m10 4 10-8" stroke="#181818" /></g>
        <circle cx="20" cy="106" r="3" fill="#dfb479" /><circle cx="224" cy="53" r="3" fill="#dfb479" />
      </> : <>
        <rect width="720" height="520" fill="#272727" />
        <circle data-sun cx="488" cy="130" r="58" fill="#805624" />
        <circle cx="488" cy="130" r="78" stroke="#45413c" />
        <circle data-halo cx="488" cy="130" r="90" stroke="#766956" opacity=".65" />
        <g data-cloud stroke="#b9aa96" strokeWidth="2" strokeLinecap="round"><path d="M90 114h96m-72-12h45M530 216h100m-75-12h36" /></g>
        <g data-cloud stroke="#766956" strokeWidth="2" strokeLinecap="round"><path d="M280 72h72m-48 12h69" /></g>
        <path d="M-30 360 174 152 304 302 424 192 716 380" fill="#313131" stroke="#766956" strokeWidth="1.5" />
        <path d="m141 187 33-35 51 59-38-14-17 9-16-21Z" fill="#b9aa96" opacity=".6" />
        <path d="m397 220 27-28 48 38-33-9-11 11-14-14Z" fill="#b9aa96" opacity=".45" />
        <path d="M-10 402c124-104 200-38 310-76s256-51 430 25v169H-10Z" fill="#1f1f1f" />
        <path d="M-12 425c158-64 226 50 382-8s243-38 365 30v73H-12Z" fill="#181818" />
        <path d="M390 520c-100-90 128-90 44-158-20-16-44-18-36-33" stroke="#805624" strokeWidth="22" />
        <path d="M390 520c-100-90 128-90 44-158-20-16-44-18-36-33" stroke="#dfb479" strokeWidth="1" strokeDasharray="4 9" />
        <path d="M40 285c111-93 204-68 326-110s172-104 269-60" stroke="#766956" strokeWidth="1.5" strokeDasharray="4 9" />
        <g data-plane transform="translate(365 167) rotate(-18)"><path d="m-22 0 60-17-22 23-7 25-11-21Z" fill="#dfb479" /><path d="m-2 10 23-17" stroke="#181818" strokeWidth="1.5" /></g>
        <path d="M-20 378h760" stroke="#766956" strokeWidth="2" />
        <path d="M90 378v38m90-38v25m90-25v43m90-43v40m90-40v26m90-26v35m90-35v48" stroke="#45413c" strokeWidth="4" />
        <g data-train transform="translate(115 348)"><rect width="126" height="25" rx="8" fill="#dfb479" /><path d="M42 349v22m42-22v22" transform="translate(0 -348)" stroke="#805624" /><path d="M12 7h18m24 0h18m24 0h14" stroke="#181818" strokeWidth="6" /><circle cx="24" cy="26" r="4" fill="#b9aa96" /><circle cx="104" cy="26" r="4" fill="#b9aa96" /></g>
        <g stroke="#766956" strokeWidth="1.5"><path d="M60 460v-47m-15 30 15-20 15 20m-26-13 11-15 11 15M612 476v-66m-19 39 19-28 19 28m-34-20 15-23 15 23" /></g>
        <circle cx="40" cy="285" r="5" fill="#dfb479" /><circle cx="635" cy="115" r="5" fill="#dfb479" />
      </>}
      <g data-route-light><circle cx={compact ? 20 : 40} cy={compact ? 106 : 285} r={compact ? 3 : 5} fill="#eddbc0" /><circle cx={compact ? 20 : 40} cy={compact ? 106 : 285} r={compact ? 7 : 12} stroke="#dfb479" opacity=".45" /></g>
      {(compact ? [[94, 24], [208, 79], [40, 67]] : [[246, 130], [581, 84], [647, 258]]).map(([cx, cy], index) => <g data-mote key={index} opacity=".65"><path d={`M${cx - 3} ${cy}h6m-3-3v6`} stroke="#dfb479" strokeWidth="1" /></g>)}
    </svg>
  </div>;
}
