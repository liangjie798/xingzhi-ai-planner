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

export function useSwitchEntrance(value: string, enterChildren?: string) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      if (!root.current) return;
      gsap.fromTo(root.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .42, ease: "power3.out", clearProps: "opacity,transform" });
      // Reused workspaces need their newly rendered content animated on every view change.
      const children = enterChildren ? root.current.querySelectorAll(enterChildren) : [];
      if (children.length) {
        gsap.fromTo(children, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: .46, delay: .04, stagger: { amount: .14 }, ease: "power3.out", clearProps: "opacity,transform" });
      }
    });
    return () => media.revert();
  }, { scope: root, dependencies: [value, enterChildren], revertOnUpdate: true });
  return root;
}

/** Animate content without changing the shared login card's vertical anchor. */
export function LoginPanel({ value, children }: { value: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!root.current || !content.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(content.current, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: .28, delay: .04, clearProps: "opacity,transform" });
  }, { dependencies: [value], scope: root, revertOnUpdate: true });
  return <div ref={root} className="login-panel"><div ref={content} className="login-panel-content">{children}</div></div>;
}
