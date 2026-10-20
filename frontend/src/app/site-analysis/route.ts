import { NextResponse } from "next/server";
import { callLlm, extractJson, type ClientModelConfig } from "@/lib/llm-server";

interface ImageSignals { width: number; height: number; brightness: number; contrast: number; darkShare: number; brightShare: number; greenShare: number }
interface RequestBody { imageDataUrl?: string; signals?: ImageSignals; activityType?: string; locationName?: string; config?: ClientModelConfig }
interface VisionResult { summary?: string; shade?: string; drainage?: string; surface?: string; evacuation?: string; crowd?: string; warnings?: string[] }

export const maxDuration = 60;

function supportsImageInput(model = "") {
  return /(gpt-(?:4o|4\.1|5)|qwen.*(?:vl|vision)|gemini|claude|llava|vision|glm-4v|internvl|pixtral)/i.test(model);
}

function localFallback(signals?: ImageSignals) {
  if (!signals) return {
    summary: "图片已接收，视觉模型当前不可用，场地条件需现场复核",
    shade: "遮阴条件需现场复核", drainage: "排水能力需现场复核", surface: "地面状况需现场复核", evacuation: "疏散通道需现场复核",
    warnings: ["请补充场地全景、地面和出入口照片"], provider: "安全降级", model: "image-review-fallback", degraded: true,
  };
  const shade = signals.darkShare >= 38 ? `画面暗部 ${signals.darkShare}%，可能存在遮阴或曝光不足` : signals.brightShare >= 35 ? `画面高亮 ${signals.brightShare}%，日照或过曝风险需复核` : `画面亮度 ${signals.brightness}%，遮阴范围需现场复核`;
  return {
    summary: `已完成 ${signals.width}×${signals.height} 图像特征检测，设施语义需现场复核`,
    shade,
    drainage: "单张照片无法证明排水能力，雨后需复查积水",
    surface: `画面对比度 ${signals.contrast}%，地面材质与防滑性需近景确认`,
    evacuation: "出入口宽度与疏散路径需补拍全景确认",
    crowd: `绿色像素约 ${signals.greenShare}%，不可据此推断场地承载人数`,
    warnings: ["当前文本模型不支持图片输入", "请补充地面、排水口和出入口近景"],
    provider: "端侧图像特征分析", model: "image-signals-v1", degraded: true,
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as RequestBody | null;
  if (!body?.imageDataUrl || !/^data:image\/(jpeg|png|webp);base64,/i.test(body.imageDataUrl) || body.imageDataUrl.length > 5_500_000)
    return NextResponse.json({ detail: "请上传 4MB 以内的 JPG、PNG 或 WebP 图片" }, { status: 400 });
  const prompt = `分析这张活动场地照片，活动类型为${body.activityType || "户外活动"}，地点为${body.locationName || "未填写"}。只描述图中可见事实，不猜测天气、承载人数或未拍到的设施。返回JSON：summary（60字内）、shade、drainage、surface、evacuation、crowd（各20字内）、warnings（最多3条）。无法判断写“需现场复核”。`;
  if (!supportsImageInput(body.config?.model)) return NextResponse.json(localFallback(body.signals));
  try {
    const result = await callLlm({ system: "你是户外活动场地视觉审查员。必须区分可见事实与待现场复核项，只输出JSON。", prompt, imageDataUrl: body.imageDataUrl, config: body.config });
    const parsed = extractJson<VisionResult>(result.text);
    if (!parsed?.summary) throw new Error("视觉模型未返回结构化结果");
    return NextResponse.json({ ...parsed, provider: result.provider, model: result.model });
  } catch (error) {
    console.warn("Vision provider unavailable; using local image signals", error instanceof Error ? error.message.slice(0, 240) : "unknown error");
    return NextResponse.json(localFallback(body.signals));
  }
}
