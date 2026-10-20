import { NextResponse } from "next/server";
import { callLlm, extractJson, type ClientModelConfig } from "@/lib/llm-server";

interface RequestBody { imageDataUrl?: string; activityType?: string; locationName?: string; config?: ClientModelConfig }
interface VisionResult { summary?: string; shade?: string; drainage?: string; surface?: string; evacuation?: string; crowd?: string; warnings?: string[] }

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as RequestBody | null;
  if (!body?.imageDataUrl || !/^data:image\/(jpeg|png|webp);base64,/i.test(body.imageDataUrl) || body.imageDataUrl.length > 5_500_000)
    return NextResponse.json({ detail: "请上传 4MB 以内的 JPG、PNG 或 WebP 图片" }, { status: 400 });
  const prompt = `分析这张活动场地照片，活动类型为${body.activityType || "户外活动"}，地点为${body.locationName || "未填写"}。只描述图中可见事实，不猜测天气、承载人数或未拍到的设施。返回JSON：summary（60字内）、shade、drainage、surface、evacuation、crowd（各20字内）、warnings（最多3条）。无法判断写“需现场复核”。`;
  try {
    const result = await callLlm({ system: "你是户外活动场地视觉审查员。必须区分可见事实与待现场复核项，只输出JSON。", prompt, imageDataUrl: body.imageDataUrl, config: body.config });
    const parsed = extractJson<VisionResult>(result.text);
    if (!parsed?.summary) throw new Error("视觉模型未返回结构化结果");
    return NextResponse.json({ ...parsed, provider: result.provider, model: result.model });
  } catch (error) {
    return NextResponse.json({ detail: error instanceof Error ? error.message : "场地图片分析失败" }, { status: 502 });
  }
}
