import { NextResponse, type NextRequest } from "next/server";
import { INTRO_COOKIE, INTRO_MAX_AGE_SECONDS, needsIntroGate } from "@/lib/intro-gate";

// Keep administrators out of user business routes, including direct API requests.
// Java separately enforces the same boundary on /api/** endpoints.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // 介绍页前置：看过介绍页后才允许进入主登录页；/welcome 负责写入看完标记。
  if (pathname === "/welcome" && !request.cookies.get(INTRO_COOKIE)?.value) {
    const response = NextResponse.next();
    response.cookies.set({
      name: INTRO_COOKIE,
      value: "1",
      path: "/",
      maxAge: INTRO_MAX_AGE_SECONDS,
      sameSite: "lax",
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
    });
    return response;
  }
  if (needsIntroGate(pathname, request.headers.get("cookie"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/welcome";
    url.search = "";
    url.searchParams.set("from", "login");
    return NextResponse.redirect(url);
  }
  if (pathname === "/welcome" || pathname === "/login") return NextResponse.next();
  const cookie = request.headers.get("cookie");
  if (!cookie) return NextResponse.next();
  const pages = ["/transport", "/transport-search", "/XingZhi", "/dashboard", "/hourly", "/settings", "/account"];
  const isPage = pages.includes(request.nextUrl.pathname);
  try {
    const backend = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8080";
    const response = await fetch(`${backend.replace(/\/$/, "")}/api/v1/auth/me`, { headers: { cookie }, cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (response.status === 401 || response.status === 403) return NextResponse.next();
    if (!response.ok) throw new Error("session-unavailable");
    const body = await response.text();
    const user = body.trim() ? JSON.parse(body) as { role?: string } : null;
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role || "")) return NextResponse.next();
    const denied = isPage
      ? NextResponse.redirect(new URL("/admin", request.url))
      : NextResponse.json({ detail: "请在独立管理平台管理用户、处理反馈和查看统计。如需使用规划功能，请以用户或访客身份登录。" }, { status: 403 });
    denied.headers.set("Cache-Control", "private, no-store");
    return denied;
  } catch {
    return NextResponse.json({ detail: "暂时无法确认账户权限，请稍后重试。" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

export const config = {
  matcher: ["/welcome", "/login", "/transport", "/transport-search", "/XingZhi", "/dashboard", "/hourly", "/settings", "/account", "/conversation-planner", "/journey-search", "/agent-tools", "/tourism-planner", "/activity-venues", "/planning-evidence", "/model-gateway", "/social-research", "/location-gateway", "/national-environment", "/region-data/:path*", "/plan-media"],
};
