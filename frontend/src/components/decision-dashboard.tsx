"use client";

import {
  ArrowClockwise, Clock, CloudSun, Compass,
  ChatCircleDots,
  Crosshair, Drop, Gauge, GearSix, MagnifyingGlass, MapPin, MapTrifold,
  ShieldCheck, Sparkle,
  PaperPlaneTilt, ThermometerSimple, WarningCircle, Wind,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { EnvironmentCharts } from "./environment-charts";
import { ActivityComparison } from "./activity-comparison";
import type { SocialResearch } from "@/lib/social-research";
import { EnvironmentMap } from "./environment-map";
import { NationalEnvironmentMap } from "./national-environment-map";
import { SlidingSelection, useSwitchEntrance } from "./switch-motion";
import { WelcomeGreeting } from "./welcome-greeting";
import { AccountBadge } from "./account-badge";
import { UserFeedbackPanel } from "./user-feedback";
import { authenticatedRequest } from "@/lib/auth";
import { enrichActivityVenues } from "@/lib/activity-venues-client";
import { enrichRouteEvidence } from "@/lib/place-evidence-client";
import { mergePlaceEvidence } from "@/lib/place-evidence";
import { OperationsWorkspace } from "./operations-workspace";
import { emptyWorkspace,type WorkspaceData,type SavedPlan } from "@/lib/workspace-data";
import { removeTourismStop } from "@/lib/tourism-replan";
import { TourismScheduleChart } from "./tourism-schedule-chart";
import { DecisionResultPanel } from "./decision-result-panel";
import { AgentProgress } from "./agent-progress";
import { answerAgentAction, detectAgentAction, type AgentAction } from "@/lib/agent-actions";
import type { MapSelection } from "./environment-map";
import { reverseGeocode, searchChinaDistricts } from "@/lib/amap-lbs";
import { cityById, saveSelectedCity } from "@/lib/cities";
import type { CityOption } from "@/lib/cities";
import { intakeChoices, type IntakeState } from "@/lib/conversation-intake";
import type { DestinationContext } from "@/lib/destination-knowledge";
import { describeDestinationPreferences } from "@/lib/destination-knowledge";
import { fetchTourismRoute } from "@/lib/tourism";
import type {
  ActivityInput, CityEnvironment, CitySearchResult, DecisionResult,
  GridPoint, LayerKey, ToolTraceItem, TourismRoute,
} from "@/lib/types";

const layers: Array<{ key: LayerKey; label: string; icon: typeof Gauge }> = [
  { key: "comfort", label: "活动适宜度", icon: Gauge },
  { key: "temperature", label: "气温", icon: ThermometerSimple },
  { key: "humidity", label: "湿度", icon: Drop },
  { key: "aqi", label: "US AQI", icon: Wind },
  { key: "heat", label: "热风险", icon: CloudSun },
];
function dateString(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const initialInput: ActivityInput = {
  cityId: "hangzhou", activityType: "校园运动会", date: "", endDate: "",
  startHour: 14, duration: 2, participants: 500, intensity: "中强度", group: "儿童青少年",
  locationName: "杭州某学校操场",
};

async function apiError(response: Response) {
  try {
    const body = await response.json() as { detail?: string };
    return body.detail || `服务返回 ${response.status}`;
  } catch {
    return `服务返回 ${response.status}`;
  }
}

async function readAgentStream(response: Response, onTrace: (item: ToolTraceItem) => void) {
  if (!response.body) throw new Error("浏览器不支持流式决策响应");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: DecisionResult | null = null;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = frame.split(/\r?\n/).find((line) => line.startsWith("event:"))?.slice(6).trim();
      const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5)).join("\n");
      if (!data) continue;
      if (event === "trace") onTrace(JSON.parse(data) as ToolTraceItem);
      if (event === "result") result = JSON.parse(data) as DecisionResult;
      if (event === "error") throw new Error((JSON.parse(data) as { detail?: string }).detail || "Agent执行失败");
    }
    if (done) break;
  }
  if (!result) throw new Error("Agent没有返回最终决策");
  return result;
}

interface RegionBounds {
  cityId: string;
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

interface ChatMessage { role: "user" | "assistant"; content: string; kind?: string; sources?: Array<{ title: string; url?: string; detail?: string }> }
type WorkspaceView = "studio" | "map" | "plan" | "execution" | "library" | "archive";
interface ConversationResponse {
  weatherContext?: { cityName?: string; date?: string };
  activeTopic?: string;
  visualization?: "compare-days";
  knowledgeContext?: DestinationContext;
  reply: string;
  command: "analyze" | "clarify" | "answer";
  kind?: string;
  sources?: ChatMessage["sources"];
  patch: Partial<ActivityInput> & { cityName?: string };
  provider?: string;
  intake: IntakeState;
  missing: string[];
}

export function DecisionDashboard() {
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("studio");
  const [workspaceData,setWorkspaceData]=useState<WorkspaceData>(emptyWorkspace);
  const workspaceMotion = useSwitchEntrance(workspaceView);
  const [input, setInput] = useState<ActivityInput>(initialInput);
  const [layer, setLayer] = useState<LayerKey>("comfort");
  const [city, setCity] = useState<CityEnvironment | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [route, setRoute] = useState<TourismRoute | null>(null);
  const [grid, setGrid] = useState<GridPoint[]>([]);
  const [regionBounds, setRegionBounds] = useState<RegionBounds | null>(null);
  const [isLoadingCity, setIsLoadingCity] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [liveTrace, setLiveTrace] = useState<ToolTraceItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"plan" | "evidence" | "trace">("plan");
  const [intake, setIntake] = useState<IntakeState>({ known: {} });
  const hasDestination = !!intake.known.cityName;
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CitySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const searchTimer = useRef<number | null>(null);
  const chatScroll = useRef<HTMLDivElement>(null);
  const [agentPhase, setAgentPhase] = useState("");
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [knowledgeContext, setKnowledgeContext] = useState<DestinationContext>({});
  const [weatherContext, setWeatherContext] = useState<{ cityName?: string; date?: string }>({});
  const [activeTopic, setActiveTopic] = useState("");
  const [compareDays, setCompareDays] = useState(false);
  const [memoryReady, setMemoryReady] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState("正在恢复对话记忆…");
  const memoryQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "你好，我是行知。可以直接问“明天西安的天气”，也可以让我规划旅行或活动。\n查询问题我会直接回答；规划需求会与你逐步确认。资料不足或无法核实时，我会如实说明。", kind: "从这里开始" },
  ]);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const isTourism = input.activityType === "旅游规划";

  useEffect(() => {
    let active = true;
    void authenticatedRequest<{ workspaceData?:WorkspaceData; version?: number; messages?: ChatMessage[]; intake?: IntakeState; knowledgeContext?: DestinationContext; weatherContext?: { cityName?: string; date?: string }; activeTopic?: string; input?: ActivityInput; result?: DecisionResult; route?: TourismRoute; compareDays?: boolean }>("/api/v1/conversation-memory").then(saved => {
      if (!active) return;
      if (saved.version === 1 && Array.isArray(saved.messages) && saved.messages.length) {
        setChatMessages(saved.messages.filter(item => ["user", "assistant"].includes(item.role) && typeof item.content === "string").slice(-60));
        setIntake(saved.intake || { known: {} }); setKnowledgeContext(saved.knowledgeContext || {}); setWeatherContext(saved.weatherContext || {}); setActiveTopic(saved.activeTopic || "");
        if (saved.input) setInput(saved.input);
        if(saved.workspaceData) setWorkspaceData({...emptyWorkspace,...saved.workspaceData});
        if (saved.result) {
          setResult(saved.result);
          const restored = saved.result;
          if (!restored.venues && saved.input?.cityName) void enrichActivityVenues(saved.input, restored).then(updated => { if (active) setResult(current => current === restored ? updated : current); });
        }
        if (saved.route) {
          const restored = saved.route;
          setRoute(restored);
          if (!restored.trace.some(item=>item.id === "place-evidence")) void enrichRouteEvidence(restored).then(updated=>{ if(active) setRoute(current=>current === restored ? updated : current); });
        }
        setCompareDays(Boolean(saved.compareDays));
      }
      setMemoryStatus("上下文已保存 · 用户跨登录保留，访客在当前会话保留"); setMemoryReady(true);
    }).catch(() => { if (active) { setMemoryStatus("记忆暂不可用，本次对话仍可继续"); setMemoryReady(true); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!memoryReady || chatBusy || isAnalyzing || isPlanning) return;
    const timer = window.setTimeout(() => {
      const snapshot = { version: 1, messages: chatMessages.slice(-60), intake, knowledgeContext, weatherContext, activeTopic, input, result, route, compareDays,workspaceData };
      memoryQueue.current = memoryQueue.current.catch(() => undefined).then(() => authenticatedRequest("/api/v1/conversation-memory", "PUT", snapshot)).catch(() => setMemoryStatus("记忆保存失败，刷新前请稍后重试"));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [memoryReady, chatBusy, isAnalyzing, isPlanning, chatMessages, intake, knowledgeContext, weatherContext, activeTopic, input, result, route, compareDays,workspaceData]);

  function clearConversationMemory() {
    if (!window.confirm("清除已保存的对话、偏好、方案版本、资料、执行记录和费用？需要保留的内容请先下载。")) return;
    setChatMessages([{ role: "assistant", content: "记忆已清除。你想了解哪个城市，或者准备开展什么活动？" }]);
    setIntake({ known: {} }); setKnowledgeContext({}); setWeatherContext({}); setActiveTopic(""); setResult(null); setRoute(null); setCompareDays(false); setInput(initialInput);
    setWorkspaceData(emptyWorkspace);
    memoryQueue.current = memoryQueue.current.catch(() => undefined).then(() => authenticatedRequest("/api/v1/conversation-memory", "DELETE")).catch(() => setMemoryStatus("清除失败，请重试"));
  }

  useEffect(() => {
    chatScroll.current?.scrollTo({ top: chatScroll.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages, chatBusy]);

  useEffect(() => {
    const readView = () => {
      const value = new URLSearchParams(window.location.search).get("view");
      setWorkspaceView(["map","plan","execution","library","archive"].includes(value || "") ? value as WorkspaceView : "studio");
    };
    readView();
    window.addEventListener("popstate", readView);
    return () => window.removeEventListener("popstate", readView);
  }, []);


  const switchWorkspace = (view: WorkspaceView) => {
    setWorkspaceView(view);
    const url = view === "studio" ? "/XingZhi" : `/XingZhi?view=${view}`;
    window.history.pushState({ view }, "", url);
  };
  function restorePlan(plan:SavedPlan){setError(null);setInput(plan.input);setResult(plan.result);setRoute(plan.route);setIntake({known:{...plan.input}});switchWorkspace("plan");}
  function removeStop(name:string){
    if(!route)return;
    try {
      const updated=removeTourismStop(route,input,name);
      const before:SavedPlan={id:crypto.randomUUID(),createdAt:new Date().toISOString(),label:`删除${name}前`,input:{...input},result:null,route};
      const planKey=`${input.cityName}:${input.activityType}:${input.date}:${input.endDate || input.date}`;
      setWorkspaceData(current=>({...current,costs:current.costs.filter(cost=>cost.placeName!==name || cost.planKey&&cost.planKey!==planKey),plans:[before,...current.plans].slice(0,4)}));setRoute(updated);
    }catch(error){setError(error instanceof Error?error.message:"重新排程失败");}
  }

  const meta: CityOption = useMemo(() => {
    if (input.longitude != null && input.latitude != null) {
      return {
        id: input.cityId,
        name: input.cityName || "所选城市",
        province: input.province || "中国",
        adcode: input.adcode || input.cityId,
        center: [input.longitude, input.latitude],
      };
    }
    return cityById(input.cityId);
  }, [input.cityId, input.cityName, input.province, input.adcode, input.longitude, input.latitude]);

  const loadCity = useCallback(async (cityMeta: CityOption, signal?: AbortSignal) => {
    const params = new URLSearchParams({
      cityId: cityMeta.id,
      name: cityMeta.name,
      province: cityMeta.province,
      adcode: cityMeta.adcode,
      longitude: String(cityMeta.center[0]),
      latitude: String(cityMeta.center[1]),
    });
    try {
      const response = await fetch(`${apiBase}/api/v1/cities/environment?${params.toString()}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error(await apiError(response));
      setCity(await response.json() as CityEnvironment);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setCity(null);
      setError(caught instanceof Error ? caught.message : "实时环境数据加载失败");
    } finally {
      if (!signal?.aborted) setIsLoadingCity(false);
    }
  }, [apiBase]);

  const onRegionBounds = useCallback((bounds: Omit<RegionBounds, "cityId">) => {
    // Re-entering the map reports the same bounds. Keep its samples: unchanged
    // bounds do not rerun the sampling effect, so clearing here loses the raster.
    setRegionBounds((current) => {
      const next = { cityId: meta.id, ...bounds };
      if (current?.cityId === next.cityId
        && Math.abs(current.minLng - next.minLng) < 0.0001
        && Math.abs(current.maxLng - next.maxLng) < 0.0001
        && Math.abs(current.minLat - next.minLat) < 0.0001
        && Math.abs(current.maxLat - next.maxLat) < 0.0001) return current;
      return next;
    });
  }, [meta.id]);

  // 以完整行政区外接范围进行 3x3 采样，再由地图端插值为连续色带。
  useEffect(() => {
    if (!city || !regionBounds || regionBounds.cityId !== meta.id) return;
    const referenceHour = input.date === dateString() ? Math.min(new Date().getHours(), 22) : 12;
    let cancelled = false;
    const ratios = [0.12, 0.5, 0.88];
    const longitudes = ratios.map((ratio) => regionBounds.minLng + (regionBounds.maxLng - regionBounds.minLng) * ratio);
    const latitudes = ratios.map((ratio) => regionBounds.minLat + (regionBounds.maxLat - regionBounds.minLat) * ratio);

    void (async () => {
      const samples: GridPoint[] = [];
      await Promise.all(latitudes.flatMap((latitude) => longitudes.map(async (longitude) => {
        const params = new URLSearchParams({
          cityId: meta.id,
          name: meta.name,
          province: meta.province,
          adcode: meta.adcode,
          longitude: String(+longitude.toFixed(4)),
          latitude: String(+latitude.toFixed(4)),
          date: input.date || dateString(),
        });
        try {
          const response = await fetch(`${apiBase}/api/v1/cities/hourly?${params.toString()}`, { cache: "no-store" });
          if (!response.ok) return;
          const data = await response.json() as { hours: Array<{ hour: number; temperature: number; humidity: number; rainProbability: number; aqi: number; heatRisk: number }> };
          const point = data.hours.find((hour) => hour.hour === referenceHour) ?? data.hours[12];
          if (!point) return;
          samples.push({
            longitude: +longitude.toFixed(4),
            latitude: +latitude.toFixed(4),
            temperature: point.temperature,
            humidity: point.humidity,
            rainProbability: point.rainProbability,
            aqi: point.aqi,
            heatRisk: point.heatRisk,
            comfort: Math.round(Math.max(0, 100 - point.heatRisk * 0.42 - Math.max(0, point.aqi - 35) * 0.21 - point.rainProbability * 0.18)),
          });
        } catch { /* 单点失败不影响整体 */ }
      })));
      if (!cancelled) setGrid(samples);
    })();

    return () => { cancelled = true; };
  }, [city, meta, input.date, apiBase, regionBounds]);

  useEffect(() => {
    if (!hasDestination) return;
    const controller = new AbortController();
    queueMicrotask(() => void loadCity(meta, controller.signal));
    return () => controller.abort();
  }, [meta, loadCity, hasDestination]);

  // 使用高德行政区服务检索中国大陆省、市、区县，避免海外地名库缺项与坐标偏差。
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    const cleaned = searchQuery.trim();
    if (cleaned.length < 2) {
      return;
    }
    searchTimer.current = window.setTimeout(async () => {
      try {
        const results = await searchChinaDistricts(cleaned);
        setSearchResults(results);
        void fetch("/api/v1/analytics/search", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: cleaned, resultCount: results.length }) });
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 380);
  }, [searchQuery]);

  const selectSearchedCity = (item: CitySearchResult) => {
    const option: CityOption = {
      id: item.id,
      name: item.district && item.district !== item.name ? `${item.name}·${item.district}` : item.name,
      province: item.province,
      adcode: item.adcode,
      center: [item.longitude, item.latitude],
    };
    saveSelectedCity(option);
    setIntake((current) => ({ known: { ...current.known, cityName: option.name } }));
    setError(null);
    setResult(null);
    setRoute(null);
    setIsLoadingCity(true);
    setCity(null);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedDistrict(item.district && item.district !== item.name ? item.district : item.district || "");
    setInput((current) => ({
      ...current,
      cityId: option.id,
      cityName: option.name,
      province: option.province,
      adcode: option.adcode,
      longitude: option.center[0],
      latitude: option.center[1],
      locationName: `${option.name}集合点`,
    }));
  };

  useEffect(() => {
    queueMicrotask(() => {
      const today = dateString();
      setInput((current) => current.date ? current : { ...current, date: today, endDate: today });
    });
  }, []);

  const applyActivityLocation = useCallback((location: MapSelection & { province?: string; city?: string }) => {
    setIntake((current) => ({ known: { ...current.known, cityName: location.city || location.district || location.name } }));
    setError(null);
    setResult(null);
    setRoute(null);
    setIsLoadingCity(true);
    setSelectedDistrict(location.district || "");
    setInput((current) => ({
      ...current,
      locationName: location.name,
      cityName: location.city || current.cityName,
      province: location.province || current.province,
      adcode: location.adcode || current.adcode,
      longitude: location.longitude,
      latitude: location.latitude,
    }));
  }, []);
  const onPointSelected = useCallback((location: MapSelection) => applyActivityLocation(location), [applyActivityLocation]);

  const locateCurrentCity = () => {
    setIsLocating(true);
    setError(null);
    const applyLocation = (longitude: number, latitude: number, name: string, province: string, district: string, adcode: string, precise: boolean) => {
      const option: CityOption = { id: "geo-current", name, province, adcode, center: [longitude, latitude] };
      saveSelectedCity(option);
      setIntake((current) => ({ known: { ...current.known, cityName: name } }));
      setCity(null);
      setResult(null);
      setRoute(null);
      setIsLoadingCity(true);
      setSelectedDistrict(district);
      setInput((current) => ({ ...current, cityId: option.id, cityName: name, province,
        adcode: option.adcode, longitude, latitude,
        locationName: `${precise ? "我的位置" : "IP城市中心"} ${longitude.toFixed(4)}, ${latitude.toFixed(4)}` }));
      setIsLocating(false);
    };
    const locateByIp = async () => {
      try {
        const response = await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=zh");
        if (!response.ok) throw new Error("IP定位失败");
        const place = await response.json() as { city?: string; locality?: string; principalSubdivision?: string; longitude?: number; latitude?: number };
        if (place.longitude == null || place.latitude == null) throw new Error("IP定位缺少坐标");
        const resolved = await reverseGeocode(place.longitude, place.latitude);
        applyLocation(place.longitude, place.latitude, resolved.city, resolved.province, resolved.district, resolved.adcode, false);
      } catch {
        setIsLocating(false);
        setError("自动定位失败，请直接搜索所在市区");
      }
    };
    if (!navigator.geolocation || !window.isSecureContext) {
      void locateByIp();
      return;
    }
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const longitude = +coords.longitude.toFixed(6);
      const latitude = +coords.latitude.toFixed(6);
      try {
        const resolved = await reverseGeocode(longitude, latitude);
        applyLocation(longitude, latitude, resolved.city, resolved.province, resolved.district, resolved.adcode, true);
      } catch {
        applyLocation(longitude, latitude, "当前位置", "定位坐标", "", "", true);
      }
    }, () => {
      void locateByIp();
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
  };

  async function analyze(activity: ActivityInput = input, targetMeta: CityOption = meta) {
    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setLiveTrace([]);
    setActivePanel("trace");
    setAgentPhase("正在读取环境与执行分析工具");
    const startedAt = Date.now();
    try {
      const response = await fetch(`${apiBase}/api/v2/agent/stream`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(activity),
      });
      if (!response.ok) throw new Error(await apiError(response));
      const streamed = await readAgentStream(response, (item) => setLiveTrace((current) => [...current, item]));
      const decision = { ...streamed, totalDurationMs: Date.now() - startedAt };
      setResult(decision);
      setLiveTrace([]);
      setRoute(null);
      await loadCity(targetMeta);
      setActivePanel("plan");
      return decision;
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "决策服务暂时不可用");
      return null;
    } finally {
      const elapsed = Date.now() - startedAt;
      window.setTimeout(() => setIsAnalyzing(false), Math.max(0, 520 - elapsed));
    }
  }

  async function planTourism(activity: ActivityInput = input, targetMeta: CityOption = meta) {
    const startedAt = performance.now();
    setIsPlanning(true);
    setLiveTrace([]);
    setAgentPhase("正在读取出行日期的逐小时数据");
    setError(null);
    try {
      const start = new Date(`${activity.date || dateString()}T00:00:00+08:00`);
      const end = new Date(`${activity.endDate || activity.date || dateString()}T00:00:00+08:00`);
      const dates: string[] = [];
      for (let cursor = start; cursor <= end && dates.length < 7; cursor = new Date(cursor.getTime() + 86400000)) {
        dates.push(cursor.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }));
      }
      const hourlyResults = await Promise.allSettled(dates.map(async (date) => {
        const params = new URLSearchParams({
          cityId: targetMeta.id, date,
          name: targetMeta.name, province: targetMeta.province, adcode: targetMeta.adcode,
          longitude: String(targetMeta.center[0]), latitude: String(targetMeta.center[1]),
        });
        const response = await fetch(`${apiBase}/api/v1/cities/hourly?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(await apiError(response));
        const payload = await response.json() as { hours: Array<{ hour: number; temperature: number; humidity: number; rainProbability: number; aqi: number; heatRisk: number }> };
        return payload.hours.map((hour) => ({ ...hour, date }));
      }));
      const hourlyDays = hourlyResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const environmentMs = performance.now() - startedAt;
      setLiveTrace([{ id: "tourism-environment", name: "读取逐小时环境", detail: `已读取 ${hourlyDays.length}/${dates.length} 天的逐小时数据`, status: hourlyDays.length === dates.length ? "done" : "fallback", durationMs: environmentMs }]);
      setAgentPhase("正在检索景点、美食并编排旅行路线");
      const data = await fetchTourismRoute(apiBase, {
        cityName: targetMeta.name,
        province: targetMeta.province,
        longitude: targetMeta.center[0],
        latitude: targetMeta.center[1],
        date: activity.date || dateString(),
        endDate: activity.endDate || activity.date || dateString(),
        hours: hourlyDays.flat(),
        participants: activity.participants, group: activity.group, audienceDescription:activity.audienceDescription,budgetPerPerson:activity.budgetPerPerson,intensity: activity.intensity, referenceUrls: activity.referenceUrls, allowedStartHour: activity.allowedStartHour, allowedEndHour: activity.allowedEndHour,
      });
      data.totalDurationMs = performance.now() - startedAt;
      data.trace = data.trace.map((item) => item.id === "tour-forecast" ? { ...item, durationMs: item.durationMs + environmentMs, detail: `已读取 ${hourlyDays.length}/${dates.length} 天的逐小时环境数据，并计算推荐出行时段。` } : item);
      setRoute(data);
      setResult(null);
      setActivePanel("plan");
      setLiveTrace(data.trace);
      return data;
    } catch (caught) {
      setRoute(null);
      setError(caught instanceof Error ? caught.message : "旅游路线服务暂时不可用");
      return null;
    } finally {
      setIsPlanning(false);
    }
  }

  function runAgentAction(action: AgentAction) {
    if (!result && !route) {
      const context = [knowledgeContext.city || weatherContext.cityName, weatherContext.date].filter(Boolean).join("，");
      void submitConversation(action === "compare" ? `${context ? context + "，" : ""}帮我规划活动并比较候选时段` : action === "checklist" ? `${context ? context + "，" : ""}帮我规划活动并生成筹备清单` : "解释刚才回答的数据来源和依据");
      return;
    }
    const names = { explain: "解释本次推荐依据", compare: "比较前三个候选时段", checklist: "生成筹备检查清单" };
    setChatMessages((current) => [...current, { role: "user", content: names[action] }, { role: "assistant", content: answerAgentAction(action, input, result, route) }]);
  }

  async function submitConversation(choice?: string) {
    const conversationStarted = performance.now();
    const message = (choice || chatText).trim();
    if (!message || chatBusy || !memoryReady) return;
    const userMessage: ChatMessage = { role: "user", content: message };
    const history = [...chatMessages, userMessage];
    setChatMessages(history);
    setChatText("");
    const action = detectAgentAction(message);
    if (action && (result || route) && !knowledgeContext.topic && !/画|图|只看|改|调整|参与者/.test(message) && /本次|本轮|方案|候选时段|推荐依据|筹备清单/.test(message)) {
      setChatMessages([...history, { role: "assistant", content: answerAgentAction(action, input, result, route) }]);
      return;
    }
    setChatBusy(true);
    setError(null);
    try {
      const response = await fetch("/conversation-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message, today: dateString(), intake, history: history.slice(-12), knowledgeContext, weatherContext, activeTopic,
        }),
      });
      if (!response.ok) throw new Error(await apiError(response));
      const plan = await response.json() as ConversationResponse;
      setIntake(plan.intake);
      if (plan.knowledgeContext) setKnowledgeContext(plan.knowledgeContext);
      if (plan.weatherContext) setWeatherContext(plan.weatherContext);
      setActiveTopic(plan.activeTopic || (plan.command === "answer" ? "knowledge" : "planning"));
      if (plan.visualization) setCompareDays(true);
      setChatMessages((current) => [...current, { role: "assistant", content: plan.reply, kind: plan.kind || (plan.command === "clarify" ? "补充规划条件" : "开始规划"), sources: plan.sources }]);
      if (plan.command !== "analyze") return;
      let targetMeta = meta;
      let nextInput: ActivityInput = { ...input, ...plan.patch };
      if (plan.patch.cityName && plan.patch.cityName !== meta.name) {
        const matches = await searchChinaDistricts(plan.patch.cityName);
        const match = matches[0];
        if (!match) throw new Error(`没有找到“${plan.patch.cityName}”，请换用完整的市或区县名称`);
        targetMeta = {
          id: match.id, name: match.district && match.district !== match.name ? `${match.name}·${match.district}` : match.name,
          province: match.province, adcode: match.adcode, center: [match.longitude, match.latitude],
        };
        saveSelectedCity(targetMeta);
        nextInput = {
          ...nextInput, cityId: targetMeta.id, cityName: targetMeta.name, province: targetMeta.province,
          adcode: targetMeta.adcode, longitude: targetMeta.center[0], latitude: targetMeta.center[1],
          locationName: `${targetMeta.name}活动地点`,
        };
        setSelectedDistrict(match.district && match.district !== match.name ? match.district : "");
        setCity(null);
        setIsLoadingCity(true);
      }
      if (nextInput.date && (!nextInput.endDate || nextInput.endDate < nextInput.date)) nextInput.endDate = nextInput.date;
      setInput(nextInput);
      setResult(null);
      setRoute(null);
      await loadCity(targetMeta);
      const completed = nextInput.activityType === "旅游规划" ? await planTourism(nextInput, targetMeta) : await analyze(nextInput, targetMeta);
      if (!completed) throw new Error("本次分析未完成，请查看错误提示后重试。");
      if (nextInput.activityType !== "旅游规划") {
        const venueTask = "recommendation" in completed ? enrichActivityVenues(nextInput, completed) : null;
        const socialStarted = performance.now();
        try {
          const socialResponse = await fetch("/social-research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city: targetMeta.name, activity: nextInput.activityType, urls: nextInput.referenceUrls }), signal: AbortSignal.timeout(13000) });
          if (socialResponse.ok) {
            const social = await socialResponse.json() as SocialResearch;
            completed.socialResearch = social;
            completed.evidence.push(...social.items.map((item) => ({ title: item.title, publisher: item.provider ? `${item.platform} · ${item.provider}` : item.platform, excerpt: item.excerpt || "联网资料，作为活动灵感参考", sourceUrl: item.url, tag: "联网检索资料" })));
            completed.trace.push({ id: "social-public", name: "联网搜索攻略与活动资料", detail: social.sources.map((source) => source.platform + "：" + source.detail).join("；"), status: social.items.length ? "done" : "fallback", durationMs: social.durationMs });
          }
        } catch { completed.trace.push({ id: "social-public", name: "联网搜索攻略与活动资料", detail: "联网检索未完成，本次仅使用真实环境数据与场景规则", status: "fallback", durationMs: performance.now() - socialStarted }); }
        if (venueTask && "recommendation" in completed) {
          const enriched = await venueTask;
          completed.venues = enriched.venues; completed.venueNotice = enriched.venueNotice;
          completed.evidence = mergePlaceEvidence([...enriched.evidence,...completed.evidence]);
          completed.trace.push(...enriched.trace.filter(item => ["activity-venues","place-evidence"].includes(item.id)));
        }
      }
      completed.totalDurationMs = performance.now() - conversationStarted;
      const savedPlan:SavedPlan={id:crypto.randomUUID(),createdAt:new Date().toISOString(),label:`${nextInput.cityName} · ${nextInput.activityType}`,input:{...nextInput},result:"recommendation" in completed?{...completed,socialResearch:undefined}:null,route:"recommendation" in completed?null:{...completed,socialResearch:undefined}};
      setWorkspaceData(current=>({...current,plans:[savedPlan,...current.plans].slice(0,4)}));
      if ("recommendation" in completed) { setLiveTrace(completed.trace); setResult({ ...completed }); }
      else setRoute({ ...completed });
      setChatMessages((current) => [...current, { role: "assistant", content: "recommendation" in completed ? `${completed.recommendation}。\n${completed.summary}\n完整规划书已生成，可在执行方案中阅读或下载。也可以继续询问依据、比较时段或生成筹备清单。` : `${completed.cityName}${completed.dayCount}日规划已完成。\n${completed.summary}\n共安排 ${completed.stops.length} 个景点与美食站点。前往执行方案阅读完整规划书并下载。` }]);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "对话分析暂时不可用";
      setError(detail);
      setChatMessages((current) => [...current, { role: "assistant", content: detail }]);
    } finally {
      setChatBusy(false);
    }
  }

  const updatedAt = city ? new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(city.updatedAt)) : "";
  const visibleSlots = result
    ? result.slots.filter((slot) => compareDays || !result.bestSlot.date || slot.date === result.bestSlot.date)
    : [];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true"><Compass size={23} weight="duotone" /></div>
          <div><p className="brand-name">行知</p><p className="brand-subtitle">AI 活动与旅行规划</p></div>
        </div>
        <nav className="primary-nav" aria-label="工作区导航"><SlidingSelection value={workspaceView} />
          <button type="button" className={`nav-item ${workspaceView === "studio" ? "is-active" : ""}`} onClick={() => switchWorkspace("studio")}>分析台</button>
          <button type="button" className={`nav-item ${workspaceView === "map" ? "is-active" : ""}`} onClick={() => switchWorkspace("map")}>环境地图</button>
          <button type="button" className={`nav-item ${workspaceView === "plan" ? "is-active" : ""}`} onClick={() => switchWorkspace("plan")}>执行方案</button>
          {([["execution","执行管理"],["library","资料库"],["archive","活动档案"]] as const).map(([view,label])=><button type="button" key={view} className={`nav-item ${workspaceView===view?"is-active":""}`} onClick={()=>switchWorkspace(view)}>{label}</button>)}
        </nav>
        <div className="topbar-actions">
          <span className={`system-status ${error ? "has-error" : ""}`}><i /> {error ? "数据连接异常" : !hasDestination ? "全国环境总览" : isLoadingCity ? "正在同步实时数据" : `实时数据 · ${updatedAt}`}</span>
          <Link className="icon-button" href="/hourly" title="逐小时数据" aria-label="逐小时数据页面"><Clock size={18} /></Link>
          <Link className="icon-button" href="/welcome" title="平台介绍" aria-label="平台介绍"><MapTrifold size={18} /></Link>
          <Link className="icon-button" href="/settings" title="AI 模型配置" aria-label="AI 模型配置页面"><GearSix size={18} /></Link>
          <AccountBadge />
        </div>
      </header>

      {workspaceView==="execution"||workspaceView==="library"||workspaceView==="archive" ? <OperationsWorkspace view={workspaceView} input={input} result={result} route={route} data={workspaceData} onChange={setWorkspaceData} onRestore={restorePlan}/> : <section ref={workspaceMotion} className={`workspace workspace-${workspaceView}`}>
        <aside className="control-rail">
          <div className="rail-heading">
            <div><span className="section-kicker">目的地与需求</span><h1>一起完善这份规划</h1></div>
            <button type="button" className="icon-button compact" onClick={() => { const today = dateString(); setError(null); setResult(null); setRoute(null); setCity(null); setGrid([]); setIsLoadingCity(false); setSelectedDistrict(""); setIntake({ known: {} }); setKnowledgeContext({}); setChatMessages([{ role: "assistant", content: "开始一份新规划。你想去哪里，准备开展什么活动？" }]); setInput({ ...initialInput, date: today, endDate: today }); }} aria-label="重置活动条件"><ArrowClockwise size={17} /></button>
          </div>

          <section className="control-section" aria-labelledby="place-section-title">
          <div className="control-section-title" id="place-section-title"><MapPin size={15} /><span>地点与实时环境</span></div>

          <div className="city-search">
            <div className="input-wrap"><MagnifyingGlass size={17} />
              <input
                value={searchQuery}
                placeholder="搜索城市 / 区县，如：西湖区、临安"
                aria-label="搜索城市及下属区域"
                onChange={(event) => {
                  const value = event.target.value;
                  setSearchQuery(value);
                  setIsSearching(value.trim().length >= 2);
                  if (value.trim().length < 2) {
                    setSearchResults([]);
                    setIsSearching(false);
                  }
                }}
              />
              {isSearching && <span className="button-loader dark search-loader" />}
            </div>
            {searchResults.length > 0 && (
              <ul className="city-search-results" role="listbox">
                {searchResults.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => selectSearchedCity(item)}>
                      <MapPin size={14} />
                      <span className="city-search-name">{item.name}</span>
                      <span className="city-search-meta">{[item.district, item.province].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className="locate-button" onClick={locateCurrentCity} disabled={isLocating}><Crosshair size={16} />{isLocating ? "正在定位城市" : "自动定位当前城市"}</button>
          {hasDestination && city && <dl className="city-detail-grid" aria-label="所选城市详细环境信息"><div><dt>天气</dt><dd>{city.weather}</dd></div><div><dt>PM2.5</dt><dd>{city.pm25} μg/m³</dd></div><div><dt>风力</dt><dd>{city.windPower}级</dd></div><div><dt>降雨</dt><dd>{city.rainProbability}%</dd></div></dl>}

          </section>

          <section className="intake-summary" aria-label="对话已确认条件">
            <div className="control-section-title"><ChatCircleDots size={16} /><span>对话已确认</span></div>
            {Object.keys(intake.known).length === 0 ? <p>日期、活动和同行信息会在对话中逐步确认。</p> : <dl>
              {intake.known.cityName && <div><dt>目的地</dt><dd>{intake.known.cityName}</dd></div>}
              {intake.known.activityType && <div><dt>活动</dt><dd>{intake.known.activityType}</dd></div>}
              {intake.known.date && <div><dt>日期</dt><dd>{intake.known.date}{intake.known.endDate && intake.known.endDate !== intake.known.date ? ' 至 ' + intake.known.endDate : ''}</dd></div>}
              {intake.known.tripDays && <div><dt>天数</dt><dd>{intake.known.tripDays}天</dd></div>}
              {intake.known.participants && <div><dt>人数</dt><dd>{intake.known.participants}人 · {intake.known.audienceDescription || intake.known.group || '人群待确认'}</dd></div>}
              {intake.known.budgetPerPerson && <div><dt>人均预算</dt><dd>{intake.known.budgetPerPerson}元</dd></div>}
              {intake.known.equipmentCount && <div><dt>器材数量</dt><dd>{intake.known.equipmentCount}件/套</dd></div>}
              {intake.known.duration && <div><dt>单次时长</dt><dd>{intake.known.duration}小时</dd></div>}
              {intake.known.intensity && <div><dt>强度</dt><dd>{intake.known.intensity}</dd></div>}
              {intake.known.startHour !== undefined && <div><dt>偏好时段</dt><dd>{String(intake.known.startHour).padStart(2, '0')}:00 起</dd></div>}
              {intake.known.allowedStartHour !== undefined && <div><dt>时段限制</dt><dd>{intake.known.allowedStartHour}:00–{intake.known.allowedEndHour}:00（覆盖全程）</dd></div>}
            </dl>}
            <button type="button" onClick={() => document.getElementById('conversation-input')?.focus()}>在对话中补充或修改 <ChatCircleDots size={15} /></button>
          </section>
          {error && <div className="error-notice" role="alert"><WarningCircle size={17} /><span>{error}</span></div>}
          <p className="rail-footnote"><ShieldCheck size={14} /> 实时预报计算，AI 仅生成可解释文字</p>
        </aside>

        <section className="map-workbench">
          <header className="studio-page-heading"><WelcomeGreeting /><span>行知 / 智能规划工作室</span><h1>从一个想法，到一份可执行的计划。</h1><p>告诉我想去哪、何时出发、准备做什么。</p></header>
          <section className="analysis-console is-expanded" aria-label="对话驱动数据分析">
            <div className="analysis-console-head">
              <div><span className="conversation-icon"><ChatCircleDots size={19} weight="duotone" /></span><div><strong>与行知对话</strong><small>查天气 · 问知识 · 做规划，回答附资料依据</small></div></div>
              <span className="conversation-count">{chatMessages.length} 条消息 · 自动显示</span>
            </div>
            <div className="memory-toolbar"><small role="status">{memoryStatus}{activeTopic === "weather" && weatherContext.cityName ? ` · 天气：${weatherContext.cityName}` : ""}</small><button type="button" disabled={chatBusy || !memoryReady} onClick={clearConversationMemory}>清除对话记忆</button></div>
            {knowledgeContext.topic && <div className="knowledge-context" aria-label="已确认问答偏好"><span>正在讨论：{knowledgeContext.city || "选择目的地"}{describeDestinationPreferences(knowledgeContext) ? ` · ${describeDestinationPreferences(knowledgeContext)}` : ""}</span><button type="button" disabled={chatBusy} onClick={() => setKnowledgeContext({})}>清除偏好</button></div>}
            <div ref={chatScroll} className="conversation-messages" aria-live="polite">{chatMessages.map((message, index) => <InkMessage message={message} key={`${message.role}-${index}`} />)}{chatBusy && <ThinkingIndicator />}</div>
            <IntakeChoiceButtons known={intake.known} onAnswer={submitConversation} enabled={!chatBusy && memoryReady && activeTopic === "planning"} />
            <div className="agent-actions" aria-label="Agent 分析工具"><button type="button" disabled={chatBusy || isAnalyzing || isPlanning} onClick={() => runAgentAction("explain")}>解释推荐依据</button><button type="button" disabled={chatBusy || isAnalyzing || isPlanning} onClick={() => runAgentAction("compare")}>对比候选时段</button><button type="button" disabled={chatBusy || isAnalyzing || isPlanning} onClick={() => runAgentAction("checklist")}>生成筹备清单</button></div>
            <form className="analysis-console-form" onSubmit={(event) => { event.preventDefault(); void submitConversation(); }}>
              <textarea id="conversation-input" aria-label="问题或规划需求" value={chatText} onChange={(event) => setChatText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submitConversation(); } }} placeholder="问一个问题，或告诉我你的旅行与活动想法…" rows={2} />
              <button type="submit" disabled={!chatText.trim() || chatBusy || !memoryReady} aria-label="发送分析要求">{chatBusy ? <span className="button-loader" /> : <PaperPlaneTilt size={18} weight="fill" />}<span>发送</span></button>
            </form>
            {chatMessages.length === 1 && <div className="conversation-suggestions"><button type="button" onClick={() => setChatText("明天西安的天气怎么样？")}>查明天天气</button><button type="button" onClick={() => setChatText("US AQI 和 PM2.5 有什么区别？")}>了解空气指标</button><button type="button" onClick={() => setChatText("帮我规划三天旅游路线")}>规划三天旅行</button></div>}
            <p className="conversation-disclosure">实时信息以查询结果为准，搜索摘要附原文链接；无法确认的内容会明确说明。Enter 发送 · Shift+Enter 换行</p>
          </section>
          <div className="studio-agent-progress"><AgentProgress items={liveTrace.length ? liveTrace : route?.trace ?? result?.trace ?? []} running={isAnalyzing || isPlanning || chatBusy} phase={chatBusy && !isAnalyzing && !isPlanning ? "正在理解活动条件" : agentPhase} /></div>
          <UserFeedbackPanel />
          {result && <ActivityComparison input={input} result={result} />}
          <section className="studio-overview" aria-label="分析工作流概览">
            <div className="studio-intro"><span className="section-kicker">本轮工作成果</span><h2>{route ? `${route.cityName}${route.dayCount}日旅行规划` : result ? result.recommendation : "地图、方案与执行记录，随分析一起生成。"}</h2><p>{route?.summary || result?.summary || "你可以随时补充人数、调整时长，或让我比较不同的活动时段。"}</p></div>
            <button type="button" className="workspace-card" onClick={() => switchWorkspace("map")}><span><MapTrifold size={24} weight="duotone" /></span><div><strong>查看环境地图</strong><small>{hasDestination ? meta.name : "全国"} · {layer === "comfort" ? "活动适宜度" : layers.find((item) => item.key === layer)?.label}</small></div><b>进入</b></button>
            <button type="button" className="workspace-card" onClick={() => switchWorkspace("plan")}><span><ClipboardTextIcon /></span><div><strong>查看执行方案</strong><small>{result || route ? "已有最新分析结果" : "生成结果后在此查看完整方案"}</small></div><b>进入</b></button>
          </section>
          <div className="city-summary">
            <div><span className="section-kicker">{hasDestination ? `${meta.province} · ${meta.adcode} · ${city ? `实况更新 ${updatedAt}` : "正在连接数据源"}` : "中国 · 全国环境总览"}</span><h2>{hasDestination ? `${meta.name}${selectedDistrict ? ` · ${selectedDistrict}` : ""}当前环境空间图` : "全国环境空间图"}</h2></div>
            {hasDestination && <div className="city-metrics" aria-label="城市环境概览">
              <Metric icon={ThermometerSimple} value={city ? `${city.temperature}°` : "--"} label="气温" />
              <Metric icon={Drop} value={city ? `${city.humidity}%` : "--"} label="湿度" />
              <Metric icon={Wind} value={city ? `${city.aqi}` : "--"} label="US AQI" />
              <Metric icon={CloudSun} value={city ? `${city.heatRisk}` : "--"} label="热风险" />
            </div>}
          </div>
          <div className="layer-bar" aria-label="环境图层">{layers.map((item) => { const Icon = item.icon; return <button type="button" key={item.key} className={layer === item.key ? "is-active" : ""} onClick={() => setLayer(item.key)}><Icon size={16} /> {item.label}</button>; })}</div>
          {workspaceView === "map" && (!hasDestination ? <NationalEnvironmentMap layer={layer} onPointSelected={onPointSelected} /> : city
            ? <EnvironmentMap city={city} layer={layer} onPointSelected={onPointSelected} onRegionBounds={onRegionBounds} grid={grid} route={route} />
            : <div className="map-shell map-unavailable"><span className="button-loader dark" /><p>{error ? "实时数据暂不可用" : "正在载入城市环境数据"}</p></div>)}
          {workspaceView === "map" && hasDestination && city && <EnvironmentCharts city={city} date={input.date || dateString()} grid={grid} />}
          <div className="timeline-card">
            <div className="timeline-header"><div><span className="section-kicker">活动日期逐小时预测 · {input.date || "待选择日期"}</span><h3>{isTourism ? "旅游路线 · 推荐出行时段" : "候选时段活动适宜度"}</h3></div><div className="legend"><span className="good" />适宜 <span className="caution" />谨慎 <span className="bad" />不建议</div></div>
            {isTourism
              ? route ? <TourismScheduleChart route={route}/> : <div className="timeline-empty">选择城市与日期后生成旅游路线</div>
              : result
                ? <div className="slot-chart">{visibleSlots.map((slot) => { const isBest = slot.hour === result.bestSlot.hour && slot.date === result.bestSlot.date; return <button type="button" key={`${slot.date}-${slot.hour}`} className={`slot-column ${isBest ? "is-best" : ""}`} onClick={() => setInput((current) => ({ ...current, date: slot.date || current.date, startHour: slot.hour }))} aria-label={`${slot.label}适宜度${slot.score}`}><span className="slot-score">{isBest ? slot.score : ""}</span><span className={`slot-bar level-${slot.level}`} style={{ height: `${Math.max(18, slot.score)}%` }} /><span className="slot-time">{slot.hour}</span></button>; })}</div>
                : <div className="timeline-empty">选择活动条件后生成逐小时决策</div>}
            {!isTourism && result && <Link className="timeline-more" href="/hourly">查看完整逐小时页面 →</Link>}
          </div>
        </section>

        <DecisionResultPanel input={input} isTourism={isTourism} route={route} result={result} liveTrace={liveTrace} activePanel={activePanel} onPanel={setActivePanel} isPlanning={isPlanning} isAnalyzing={isAnalyzing} onRemoveStop={removeStop} />
      </section>}
    </main>
  );
}

function Metric({ icon: Icon, value, label }: { icon: typeof Gauge; value: string; label: string }) { return <div className="metric-item"><Icon size={18} /><div><strong>{value}</strong><span>{label}</span></div></div>; }

function ClipboardTextIcon() { return <Sparkle size={24} weight="duotone" />; }

function IntakeChoiceButtons({ known, enabled, onAnswer }: { known: IntakeState["known"]; enabled: boolean; onAnswer: (message: string) => Promise<void> }) {
  const choices = intakeChoices(known);
  if (!enabled || !choices.length) return null;
  return <div className="intake-choices" role="group" aria-label="快捷回答当前问题"><span>点击回答，也可以直接输入：</span>{choices.map(choice => <button key={choice.message} type="button" onClick={() => void onAnswer(choice.message)}>{choice.label}</button>)}</div>;
}

function ThinkingIndicator() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(() => setSeconds((performance.now() - started) / 1000), 100);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="conversation-message is-assistant is-thinking"><span className="ink-thinking-mark" aria-hidden="true" /><span>正在理解问题、核对资料</span><time aria-label="已用时">{seconds.toFixed(1)}s</time></div>;
}

function InkMessage({ message }: { message: ChatMessage }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (message.role !== "assistant" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.timeline()
      .fromTo(".ink-bloom", { autoAlpha: 0, scale: 0.55 }, { autoAlpha: 0.78, scale: 1, duration: 0.72, ease: "power2.out" })
      .fromTo(".ink-copy", { autoAlpha: 0, y: 7 }, { autoAlpha: 1, y: 0, duration: 0.42, ease: "power2.out" }, "-=0.42")
      .to(".ink-bloom", { autoAlpha: 0.28, duration: 0.55, ease: "sine.out" });
  }, { scope: root });
  return <div ref={root} className={`conversation-message is-${message.role}`}><span className="ink-bloom" aria-hidden="true" /><div className="ink-copy">{message.role === "assistant" && <small className="message-byline">行知{message.kind ? ` / ${message.kind}` : ""}</small>}<span>{message.content}</span>{Boolean(message.sources?.length) && <div className="message-sources" aria-label="回答依据"><small>资料依据</small>{message.sources?.map((source, i) => <div key={`${source.title}-${i}`}>{source.url && /^https:\/\//i.test(source.url) ? <a href={source.url} target="_blank" rel="noopener noreferrer">[{i + 1}] {source.title} ↗</a> : <span>[{i + 1}] {source.title}</span>}{source.detail && <small>{source.detail}</small>}</div>)}</div>}</div></div>;
}
