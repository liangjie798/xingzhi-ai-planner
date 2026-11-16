"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import s from "./page-illustration.module.css";

gsap.registerPlugin(useGSAP);

export type IllustrationKind = "studio" | "map" | "plan" | "execution" | "library" | "archive" | "transport" | "weather" | "settings" | "account" | "admin" | "login" | "privacy" | "terms" | "compass";

function Artwork({ kind }: { kind: IllustrationKind }) {
  switch (kind) {
    case "studio": return <>
      <path d="M40 36h60m40 52h60" strokeDasharray="3 6" />
      <g data-drift><rect x="26" y="25" width="106" height="47" rx="12" fill="#272727" /><path d="m45 72-9 12V70M43 41h59m-59 12h40" /><circle cx="114" cy="41" r="3" fill="#dfb479" /></g>
      <g data-step><rect x="109" y="58" width="99" height="40" rx="12" fill="#313131" /><path d="m187 98 8 9V95M126 73h55m-55 12h36" /></g>
      {[0,1,2].map(i=><circle data-pulse key={i} cx={152+i*13} cy="38" r="3" fill="#dfb479" />)}
    </>;
    case "map": return <>
      <path d="m22 31 57-13 77 15 59-12v73l-58 11-78-17-57 14Zm57-13v70m77-55 1 72" />
      <path d="m32 68 34-25 34 21 29-13 47 24 29-21" stroke="#766956" />
      <g data-drift><path d="M146 39c0 16-19 29-19 29s-19-13-19-29a19 19 0 0 1 38 0Z" fill="#67441f" /><circle cx="127" cy="39" r="6" /></g>
      <ellipse data-pulse cx="127" cy="82" rx="25" ry="8" stroke="#766956" /><circle data-flow cx="37" cy="74" r="4" fill="#dfb479" />
    </>;
    case "plan": return <>
      <rect x="36" y="15" width="152" height="94" rx="8" fill="#272727" />
      <path d="M56 35h59m-59 15h36m-19 15v26h72" strokeDasharray="3 5" />
      {[0,1,2].map(i=><g data-step key={i}><circle cx={73+i*36} cy={i===0?65:91} r="6" fill="#805624" /><path d={`M${130+i*10} ${36+i*10}h24`} /></g>)}
      <g data-drift><path d="m166 70 34-11-13 16-3 19-8-16Z" fill="#dfb479" /></g>
    </>;
    case "execution": return <>
      <rect x="55" y="19" width="130" height="92" rx="9" fill="#272727" /><rect x="93" y="12" width="55" height="16" rx="5" fill="#313131" />
      {[0,1,2].map(i=><g data-step key={i}><rect x="73" y={39+i*23} width="12" height="12" rx="3" /><path d={`m76 ${45+i*23} 3 3 7-9M98 ${45+i*23}h63`} /></g>)}
      <circle data-pulse cx="193" cy="31" r="9" fill="#805624" />
    </>;
    case "library": return <>
      <path d="M26 104h187M36 108v-6m166 6v-6" />
      {[0,1,2,3].map(i=><g data-step key={i} transform={`translate(${44+i*34} ${i===2?31:22})`}><rect width="25" height={i===2?70:79} rx="4" fill={i%2?'#313131':'#272727'} /><path d="M6 12h13M6 20h13m-7 38v10" /></g>)}
      <g data-drift><path d="M155 12h18v37l-9-6-9 6Z" fill="#805624" /></g>
    </>;
    case "archive": return <>
      <path d="M25 91h190" strokeDasharray="3 6" />
      {[0,1,2].map(i=><g data-step key={i}><rect x={29+i*67} y={31-i*6} width="49" height="46" rx="5" fill="#272727" /><path d={`M${39+i*67} ${46-i*6}h27m-27 9h18`} /><path d={`M${54+i*67} ${77-i*6}v14`} /><circle cx={54+i*67} cy="91" r="5" fill="#805624" /></g>)}
      <circle data-flow cx="27" cy="91" r="3" fill="#eddbc0" />
    </>;
    case "transport": return <>
      <path d="M15 70c54-53 126-59 208-35M16 105h208" stroke="#766956" strokeDasharray="3 6" />
      <g data-drift><path d="m106 40 37-13-14 16-4 17-7-13Z" fill="#dfb479" /></g>
      <g data-flow><rect x="35" y="77" width="76" height="23" rx="7" fill="#805624" /><path d="M45 85h13m8 0h13m8 0h13" /><circle cx="51" cy="102" r="3" /><circle cx="94" cy="102" r="3" /></g>
      <circle data-pulse cx="204" cy="33" r="5" />
    </>;
    case "weather": return <>
      <g data-pulse><circle cx="91" cy="43" r="23" fill="#67441f" /><path d="M91 9V3m0 80v-6M57 43h-6m80 0h-6M67 19l-5-5m58 58-5-5m0-48 5-5M67 67l-5 5" /></g>
      <g data-drift><path d="M73 77c-20-1-16-26 3-26 3-32 52-32 58-5 29-7 45 31 18 32Z" fill="#272727" /></g>
      {[0,1,2].map(i=><path data-step key={i} d={`m${95+i*23} 90-5 10`} strokeLinecap="round" />)}
    </>;
    case "settings": return <>
      <path d="M36 29h168M36 60h168M36 91h168" stroke="#766956" />
      {[0,1,2].map(i=><g data-step key={i}><rect x={[65,151,94][i]} y={20+i*31} width="20" height="18" rx="5" fill="#805624" /><path d={`M${[75,161,104][i]} ${24+i*31}v10`} /></g>)}
      <circle data-flow cx="35" cy="60" r="3" fill="#dfb479" />
    </>;
    case "account": return <>
      <circle data-pulse cx="111" cy="60" r="47" stroke="#766956" strokeDasharray="3 7" />
      <g data-drift><circle cx="111" cy="46" r="14" fill="#67441f" /><path d="M84 86c0-33 54-33 54 0Z" fill="#272727" /></g>
      {[0,1].map(i=><g data-step key={i}><rect x={i?161:32} y={i?68:23} width="35" height="26" rx="5" fill="#313131" /><path d={`M${i?169:40} ${i?78:33}h17`} /></g>)}
    </>;
    case "admin": return <>
      <path d="M31 20v82h177" stroke="#766956" />
      {[0,1,2,3].map(i=><g data-step key={i}><rect x={49+i*32} y={83-i*16} width="18" height={18+i*16} rx="3" fill={i%2?'#805624':'#313131'} /></g>)}
      <g data-drift><path d="m174 15 24 9v17c0 17-24 28-24 28s-24-11-24-28V24Z" fill="#272727" /><path d="m163 39 8 8 15-19" /></g>
    </>;
    case "login": return <>
      <rect x="59" y="16" width="99" height="91" rx="10" fill="#272727" /><path d="M72 99V27h73v72M27 108h176" />
      <g data-drift><circle cx="166" cy="55" r="13" fill="#805624" /><path d="m156 64-24 24m6-6 7 7m0-15 7 7" strokeWidth="3" /></g>
      <circle data-pulse cx="131" cy="63" r="3" fill="#dfb479" /><path data-step d="m91 61 9 9 17-22" />
    </>;
    case "privacy": return <>
      <path d="m119 12 51 19v35c0 28-51 47-51 47S68 94 68 66V31Z" fill="#272727" />
      <g data-drift><rect x="98" y="49" width="43" height="33" rx="6" fill="#805624" /><path d="M106 49V37a14 14 0 0 1 28 0v12" /><circle cx="119" cy="64" r="3" fill="#dfb479" /><path d="M119 67v6" /></g>
      {[0,1].map(i=><circle data-pulse key={i} cx={i?191:45} cy={i?76:44} r="4" />)}
    </>;
    case "terms": return <>
      <path d="M65 14h84l23 23v70H65Z" fill="#272727" /><path d="M149 14v23h23" />
      {[0,1,2].map(i=><path data-step key={i} d={`M83 ${45+i*15}h65`} />)}
      <g data-drift><circle cx="168" cy="85" r="19" fill="#67441f" /><path d="m159 85 7 7 13-16" /></g>
    </>;
    case "compass": return <>
      <circle cx="120" cy="60" r="47" /><circle data-pulse cx="120" cy="60" r="38" stroke="#766956" strokeDasharray="3 7" />
      <g data-drift><path d="m141 36-13 33-29 15 13-32Z" fill="#805624" /><path d="m141 36-29 16 16 17Z" fill="#dfb479" /></g>
      <path d="M120 6v9m0 90v9M66 60h9m90 0h9" />
    </>;
  }
}

/** Decorative sketches, independent of real task progress and connection status. */
export function PageIllustration({ kind, className = "" }: { kind: IllustrationKind; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const loop = gsap.timeline({ paused: true, defaults: { ease: "power2.inOut", repeat: -1, yoyo: true } });
      const add = (selector: string, vars: gsap.TweenVars) => {
        if (root.current?.querySelector(selector)) loop.to(selector, vars, 0);
      };
      add("[data-drift]", { y: -6, x: kind === "transport" ? 24 : 0, rotation: kind === "compass" ? 24 : 0, transformOrigin: "center", duration: 3.5 });
      add("[data-step]", { opacity: .35, y: kind === "weather" ? 8 : -3, stagger: .35, duration: 1.8 });
      add("[data-pulse]", { scale: 1.12, opacity: .4, transformOrigin: "center", stagger: .3, duration: 2.5 });
      add("[data-flow]", { x: kind === "transport" ? 82 : kind === "archive" || kind === "settings" ? 164 : 18, duration: 5 });
      let visible = false;
      const sync = () => { if (visible && !document.hidden) loop.play(); else loop.pause(); };
      const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: .1 });
      if (root.current) observer.observe(root.current);
      document.addEventListener("visibilitychange", sync);
      return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); };
    });
    return () => media.revert();
  }, { scope: root, dependencies: [kind], revertOnUpdate: true });
  return <div ref={root} className={`${s.art} ${className}`} data-page-art={kind} aria-hidden="true">
    <svg viewBox="0 0 240 120" fill="none" stroke="#dfb479" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" focusable="false"><Artwork kind={kind} /></svg>
  </div>;
}
