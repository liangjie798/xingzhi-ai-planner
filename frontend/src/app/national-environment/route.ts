import { NextResponse } from "next/server";
import { get } from "node:https";
import { nationalLocations, mergeNationalSamples, type NationalEnvironment } from "@/lib/national-environment";

let cached: { expires: number; data: NationalEnvironment } | undefined;
let pending: Promise<NationalEnvironment> | undefined;
// The deployment's IPv6/auto-selected upstream connections can fail intermittently.
// Fixed provider URLs use IPv4 HTTPS, bounded response size and a request deadline.
function readSource(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = get(url, { family: 4 }, (response) => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error("environment-source-unavailable")); return; }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 2000000) { response.destroy(new Error("source-response-too-large")); return; }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new Error("invalid-source-response")); } });
    });
    const timer = setTimeout(() => request.destroy(new Error("source-timeout")), 15000);
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
  });
}
async function load(): Promise<NationalEnvironment> {
  const batches = [nationalLocations.slice(0, 17), nationalLocations.slice(17)];
  const settled = await Promise.allSettled(batches.map(async (locations) => {
    const params = new URLSearchParams({ latitude: locations.map((item) => item[3]).join(","), longitude: locations.map((item) => item[2]).join(","), timezone: "Asia/Shanghai", forecast_days: "1" });
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?${params}&current=temperature_2m,relative_humidity_2m,apparent_temperature&hourly=precipitation_probability`;
    const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?${params}&current=us_aqi`;
    const [weather, air] = await Promise.all([weatherUrl, airUrl].map(async (url) => {
      const data = await readSource(url);
      if (!Array.isArray(data) || data.length !== locations.length) throw new Error("invalid-location-results");
      return data;
    }));
    return mergeNationalSamples(locations, weather, air);
  }));
  const samples = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!samples.length) throw new Error("no-live-samples");
  return { samples, expected: nationalLocations.length, retrievedAt: new Date().toISOString(), source: "Open-Meteo · 省级代表地点采样" };
}
export async function GET() {
  try {
    if (cached && cached.expires > Date.now()) return NextResponse.json(cached.data);
    pending ??= load();
    const data = await pending;
    cached = { data, expires: Date.now() + (data.samples.length === data.expected ? 600000 : 60000) };
    return NextResponse.json(data);
  } catch { return NextResponse.json({ detail: "全国环境采样暂时不可用，请稍后重试。" }, { status: 503 }); }
  finally { pending = undefined; }
}
