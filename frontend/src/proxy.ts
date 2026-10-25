import { NextResponse, type NextRequest } from "next/server";

// Keep administrators out of user business routes, including direct API requests.
// Java separately enforces the same boundary on /api/** endpoints.
export async function proxy(request: NextRequest) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return NextResponse.next();
  const pages = ["/XingZhi", "/dashboard", "/hourly", "/settings", "/account"];
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
  matcher: ["/XingZhi", "/dashboard", "/hourly", "/settings", "/account", "/conversation-planner", "/tourism-planner", "/activity-venues", "/model-gateway", "/social-research", "/location-gateway", "/national-environment", "/region-data/:path*", "/plan-media"],
};
