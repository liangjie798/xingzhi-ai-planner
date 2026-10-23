import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url");
  let url: URL;
  try { url = new URL(raw || ""); } catch { return new NextResponse(null, { status: 400 }); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !["amap.com", "autonavi.com", "alicdn.com"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return new NextResponse(null, { status: 400 });
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(7000), next: { revalidate: 86400 } });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !/^image\/(jpeg|png|webp)/i.test(type)) return new NextResponse(null, { status: 404 });
    const reader = response.body?.getReader();
    if (!reader) return new NextResponse(null, { status: 404 });
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 6 * 1024 * 1024) { await reader.cancel(); return new NextResponse(null, { status: 413 }); }
      chunks.push(value);
    }
    return new NextResponse(new Blob(chunks as BlobPart[], { type }), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch { return new NextResponse(null, { status: 404 }); }
}
