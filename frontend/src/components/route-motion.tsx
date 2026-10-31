"use client";

import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

gsap.registerPlugin(useGSAP);

/** Fade the route without remounting its state or transforming fixed navigation. */
export function RouteMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(root.current, { opacity: 0 }, { opacity: 1, duration: .32, ease: "power2.out", clearProps: "opacity" });
    });
    return () => media.revert();
  }, { scope: root, dependencies: [pathname], revertOnUpdate: true });
  return <div ref={root} id="app-content" tabIndex={-1} className="route-stage">{children}</div>;
}
