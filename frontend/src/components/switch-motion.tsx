"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

gsap.registerPlugin(useGSAP);

/** Measures the selected button so the highlight also fits translated labels and mobile layouts. */
export function SlidingSelection({ value }: { value: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  useGSAP(() => {
    const element = marker.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;
    const measure = () => {
      const selected = parent.querySelector<HTMLElement>("button.is-active");
      if (!selected) return;
      element.style.transform = `translate(${selected.offsetLeft}px, ${selected.offsetTop}px)`;
      element.style.width = `${selected.offsetWidth}px`;
      element.style.height = `${selected.offsetHeight}px`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, { dependencies: [value], scope: marker, revertOnUpdate: true });
  return <span ref={marker} className="sliding-selection" aria-hidden="true" />;
}

export function useSwitchEntrance(value: string) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!root.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(root.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .3, ease: "power2.out", clearProps: "opacity,transform" });
  }, { dependencies: [value], scope: root, revertOnUpdate: true });
  return root;
}

/** Keep the same form mounted while interpolating the change in its natural height. */
export function LoginPanel({ value, children }: { value: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const previousHeight = useRef<number | null>(null);
  useGSAP(() => {
    if (!root.current || !content.current) return;
    const height = content.current.offsetHeight;
    const previous = previousHeight.current;
    previousHeight.current = height;
    if (previous === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(root.current, { height: previous }, { height, duration: .32, ease: "power2.inOut", clearProps: "height" });
    gsap.fromTo(content.current, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: .28, delay: .04, clearProps: "opacity,transform" });
  }, { dependencies: [value], scope: root, revertOnUpdate: true });
  return <div ref={root} className="login-panel"><div ref={content} className="login-panel-content">{children}</div></div>;
}
