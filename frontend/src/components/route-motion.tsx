"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

gsap.registerPlugin(useGSAP);

/**
 * 页面级丝滑切换：
 * 1. 拦截站内链接：旧页面先柔和退场，再执行路由跳转；
 * 2. 路由变化后新页面柔和入场（浏览器前进/后退同样适用）。
 * 3. 尊重 prefers-reduced-motion，且拦截只处理普通左键、站内、非锚点链接。
 */
export function RouteMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const navigating = useRef(false);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href") || "";
      if (!href || /^(?:#|mailto:|tel:|javascript:)/i.test(href)) return;
      let url: URL;
      try { url = new URL(anchor.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      if (navigating.current) return;
      navigating.current = true;
      document.documentElement.dataset.routeTransition = "leaving";
      const target = root.current;
      const finish = () => {
        try { router.push(url.pathname + url.search + url.hash); } catch { window.location.assign(url.href); }
        window.setTimeout(() => { navigating.current = false; }, 60);
      };
      if (!target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        finish();
        return;
      }
      gsap.to(target, {
        opacity: 0,
        y: -8,
        duration: 0.16,
        ease: "power2.in",
        overwrite: true,
        onComplete: finish,
        onInterrupt: finish,
      });
      // 网络或渲染异常时兜底恢复，避免页面停留在透明状态。
      window.setTimeout(() => {
        if (!navigating.current) return;
        navigating.current = false;
        if (target) gsap.set(target, { clearProps: "opacity,transform" });
      }, 2600);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  useGSAP(() => {
    // 广播路由变化：页面内的可恢复状态（如登录页 busy）据此清理，避免跨页保留卡死状态。
    window.dispatchEvent(new CustomEvent("xingzhi:navigate", { detail: { pathname } }));
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      if (!root.current) return;
      document.documentElement.dataset.routeTransition = "entering";
      gsap.fromTo(root.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.36, ease: "power3.out", clearProps: "opacity,transform" });
      const timer = window.setTimeout(() => { document.documentElement.dataset.routeTransition = "idle"; }, 380);
      return () => window.clearTimeout(timer);
    });
    return () => media.revert();
  }, { scope: root, dependencies: [pathname], revertOnUpdate: true });

  return <div ref={root} id="app-content" tabIndex={-1} className="route-stage">{children}</div>;
}
