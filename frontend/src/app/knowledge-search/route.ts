import { NextResponse } from "next/server";
import { retrieveRag, ragKnowledgeSize } from "@/lib/rag-knowledge";

export const maxDuration = 15;

/** 本地 RAG 知识库检索接口：用于对话依据展示与调试。 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  if (query.length < 2 || query.length > 200) return NextResponse.json({ detail: "请输入 2-200 字的检索内容" }, { status: 400 });
  const city = (url.searchParams.get("city") || "").trim().slice(0, 20) || undefined;
  const hits = retrieveRag(query, { city, topK: 5 });
  return NextResponse.json({
    query,
    city,
    documents: ragKnowledgeSize(),
    hits: hits.map(({ id, title, text, source, kind, score }) => ({ id, title, text, source, kind, score })),
  }, { headers: { "Cache-Control": "no-store" } });
}
