"use client";

import { Camera, CheckCircle, ImageSquare, WarningCircle, X } from "@phosphor-icons/react";
import Image from "next/image";
import { ChangeEvent, useState } from "react";
import { readModelConfig } from "@/lib/model-config";
import type { ActivityType } from "@/lib/types";

interface ImageSignals { width: number; height: number; brightness: number; contrast: number; darkShare: number; brightShare: number; greenShare: number }
interface Analysis { summary: string; shade?: string; drainage?: string; surface?: string; evacuation?: string; crowd?: string; warnings?: string[]; provider?: string; degraded?: boolean }

async function compress(file: File): Promise<{ imageDataUrl: string; signals: ImageSignals }> {
  const url = URL.createObjectURL(file);
  try {
    const image = document.createElement("img");
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = url; });
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器无法读取图片");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const stride = Math.max(1, Math.floor(Math.sqrt((canvas.width * canvas.height) / 50_000)));
    let count = 0; let luminanceSum = 0; let luminanceSquared = 0; let dark = 0; let bright = 0; let green = 0;
    for (let y = 0; y < canvas.height; y += stride) for (let x = 0; x < canvas.width; x += stride) {
      const offset = (y * canvas.width + x) * 4; const red = pixels[offset]; const greenChannel = pixels[offset + 1]; const blue = pixels[offset + 2];
      const luminance = .2126 * red + .7152 * greenChannel + .0722 * blue;
      count += 1; luminanceSum += luminance; luminanceSquared += luminance * luminance;
      if (luminance < 70) dark += 1; if (luminance > 210) bright += 1;
      if (greenChannel > red * 1.08 && greenChannel > blue * 1.05 && greenChannel > 60) green += 1;
    }
    const mean = luminanceSum / count;
    return { imageDataUrl: canvas.toDataURL("image/jpeg", .78), signals: {
      width: canvas.width, height: canvas.height, brightness: Math.round(mean / 2.55),
      contrast: Math.round(Math.sqrt(Math.max(0, luminanceSquared / count - mean * mean)) / 1.28),
      darkShare: Math.round(dark / count * 100), brightShare: Math.round(bright / count * 100), greenShare: Math.round(green / count * 100),
    } };
  } finally { URL.revokeObjectURL(url); }
}

export function VenuePhotoAnalysis({ activityType, locationName, onAnalysis }: { activityType: ActivityType; locationName: string; onAnalysis: (value?: string) => void }) {
  const [preview, setPreview] = useState(""); const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function select(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size > 4 * 1024 * 1024) { setError("请选择 4MB 以内的 JPG、PNG 或 WebP 图片"); return; }
    setBusy(true); setError(""); setAnalysis(null); onAnalysis(undefined);
    try {
      const { imageDataUrl, signals } = await compress(file); setPreview(imageDataUrl);
      const response = await fetch("/site-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageDataUrl, signals, activityType, locationName, config: readModelConfig() }) });
      const body = await response.json() as Analysis & { detail?: string }; if (!response.ok) throw new Error(body.detail || "图片分析失败");
      setAnalysis(body); onAnalysis([body.summary, body.shade, body.drainage, body.surface, body.evacuation, body.crowd].filter(Boolean).join("；"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "图片分析失败"); }
    finally { setBusy(false); }
  }
  function clear() { setPreview(""); setAnalysis(null); setError(""); onAnalysis(undefined); }
  return <div className="venue-analysis">
    <div className="venue-heading"><span><Camera size={15} />场地影像分析 <em>多模态</em></span>{preview && <button type="button" onClick={clear} aria-label="移除场地图片"><X size={14} /></button>}</div>
    {!preview ? <label className="venue-drop"><ImageSquare size={22} weight="duotone" /><span>上传现场照片</span><small>识别遮阴、排水、地面与疏散条件</small><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={select} /></label> : <div className="venue-result"><Image src={preview} alt="待分析场地" width={96} height={72} unoptimized />{busy ? <p><span className="button-loader dark" />视觉模型正在核验可见条件</p> : analysis ? <div><strong><CheckCircle size={14} weight="fill" />{analysis.summary}</strong><small>{[analysis.shade, analysis.drainage, analysis.surface, analysis.evacuation].filter(Boolean).join(" · ")}</small><em>{analysis.provider}{analysis.degraded ? " · 本地安全降级" : ""}</em></div> : <p><WarningCircle size={15} />{error}</p>}</div>}
    {error && !preview && <p className="venue-error">{error}</p>}
  </div>;
}
