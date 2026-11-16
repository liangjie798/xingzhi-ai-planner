"use client";

import gsap from "gsap";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 旧内容柔和退场；返回的 Promise 在动画完成或无需动画时 resolve。 */
export function animateOut(element: Element | null | undefined, options: { y?: number; duration?: number } = {}): Promise<void> {
  if (!element || prefersReducedMotion()) return Promise.resolve();
  return new Promise((resolve) => {
    gsap.to(element, {
      opacity: 0,
      y: options.y ?? -8,
      duration: options.duration ?? 0.16,
      ease: "power2.in",
      overwrite: true,
      onComplete: () => resolve(),
      onInterrupt: () => resolve(),
    });
  });
}

/** 统一「退场 → 切换 → 新内容入场」的丝滑切换，用于页面内视图/标签切换。 */
export async function smoothSwap(element: Element | null | undefined, update: () => void, options?: { y?: number; duration?: number }): Promise<void> {
  await animateOut(element, options);
  update();
}

/** 新内容柔和入场（用于没有独立入场动画的局部切换）。 */
export function animateIn(element: Element | null | undefined, options: { y?: number; duration?: number } = {}): void {
  if (!element || prefersReducedMotion()) return;
  gsap.fromTo(element, { opacity: 0, y: options.y ?? 10 }, { opacity: 1, y: 0, duration: options.duration ?? 0.3, ease: "power3.out", clearProps: "opacity,transform" });
}
