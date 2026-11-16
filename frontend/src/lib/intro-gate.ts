/**
 * 介绍页前置门禁：
 * 首次访问 /login 时还没有看过介绍页（没有 intro cookie）就先去 /welcome。
 * 纯函数便于测试；中间件只负责读写 cookie 与重定向。
 */
export const INTRO_COOKIE = "xingzhi_intro_seen";
export const INTRO_MAX_AGE_SECONDS = 60 * 60 * 24;

export function hasSeenIntro(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return new RegExp(`(?:^|;\\s*)${INTRO_COOKIE}=1(?:;|$)`).test(cookieHeader);
}

/** 只有主登录页需要先看介绍；管理端登录、API 与其它页面不受影响。 */
export function needsIntroGate(pathname: string, cookieHeader: string | null | undefined): boolean {
  return pathname === "/login" && !hasSeenIntro(cookieHeader);
}
