"use client";

import {
  ArrowClockwise, Binoculars, CalendarBlank, CaretDown, Clock, CloudSun, Compass,
  ChatCircleDots,
  Crosshair, Drop, Gauge, GearSix, Lightning, MagnifyingGlass, MapPin, MapTrifold,
  Backpack, Barbell, Buildings, ChalkboardTeacher, ShieldCheck, Sparkle,
  PaperPlaneTilt, SuitcaseRolling, ThermometerSimple, Trophy, UsersThree, WarningCircle, Wind,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EnvironmentMap } from "./environment-map";
import { AccountBadge } from "./account-badge";
import { VenuePhotoAnalysis } from "./venue-photo-analysis";
import { DecisionResultPanel } from "./decision-result-panel";
import type { MapSelection } from "./environment-map";
import { reverseGeocode, searchChinaDistricts } from "@/lib/amap-lbs";
import { cities, cityById, saveSelectedCity } from "@/lib/cities";
import type { CityOption } from "@/lib/cities";
import { fetchTourismRoute } from "@/lib/tourism";
import type {
  ActivityInput, ActivityType, CityEnvironment, CitySearchResult, DecisionResult,
  GridPoint, GroupType, Intensity, LayerKey, ToolTraceItem, TourismRoute,
} from "@/lib/types";

const layers: Array<{ key: LayerKey; label: string; icon: typeof Gauge }> = [
  { key: "comfort", label: "活动适宜度", icon: Gauge },
  { key: "temperature", label: "气温", icon: ThermometerSimple },
  { key: "humidity", label: "湿度", icon: Drop },
  { key: "aqi", label: "US AQI", icon: Wind },
  { key: "heat", label: "热风险", icon: CloudSun },
];
const activityTypes: ActivityType[] = ["校园运动会", "体育课", "社区活动", "户外训练", "研学活动", "旅游规划"];
const activityIcons: Record<ActivityType, typeof Gauge> = {
  "校园运动会": Trophy,
  "体育课": ChalkboardTeacher,
  "社区活动": Buildings,
  "户外训练": Barbell,
  "研学活动": Backpack,
  "旅游规划": SuitcaseRolling,
};
const intensities: Intensity[] = ["低强度", "中强度", "高强度"];
const groups: GroupType[] = ["普通人群", "儿童青少年", "老年人", "敏感人群"];
const activityProfiles: Record<ActivityType, { focus: string; detail: string }> = {
  "校园运动会": { focus: "多人连续、多项目联动", detail: "重点评估热风险、空气质量、医疗保障和延期条件。" },
  "体育课": { focus: "单课时、教师可控", detail: "重点评估学生负荷、课时内天气变化和室内替代课程。" },
  "社区活动": { focus: "年龄跨度大、开放场地", detail: "重点照顾老幼、敏感人群、无障碍动线和分批参与。" },
  "户外训练": { focus: "强度高、体能负荷大", detail: "加重高温与空气污染惩罚，关注心率、补水和强度下调。" },
  "研学活动": { focus: "路线长、节点多", detail: "重点评估交通衔接、集合清点、步行暴露和临时避险点。" },
  "旅游规划": { focus: "多站点、跨时段出行", detail: "根据逐小时环境避开高风险时段，并结合景点位置生成可视化路线。" },
};

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

interface ChatMessage { role: "user" | "assistant"; content: string }
interface ConversationResponse {
  reply: string;
  command: "analyze" | "clarify";
  patch: Partial<ActivityInput> & { cityName?: string };
  provider?: string;
}

export function DecisionDashboard() {
  const [input, setInput] = useState<ActivityInput>(initialInput);
  const [layer, setLayer] = useState<LayerKey>("comfort");
  const [city, setCity] = useState<CityEnvironment | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [route, setRoute] = useState<TourismRoute | null>(null);
  const [grid, setGrid] = useState<GridPoint[]>([]);
  const [regionBounds, setRegionBounds] = useState<RegionBounds | null>(null);
  const [isLoadingCity, setIsLoadingCity] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [liveTrace, setLiveTrace] = useState<ToolTraceItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"plan" | "evidence" | "trace">("plan");
  const [dateRange, setDateRange] = useState({ min: "", max: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CitySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [participantsText, setParticipantsText] = useState("0500");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const searchTimer = useRef<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "直接告诉我城市、日期和活动要求。我会更新表单，查询真实逐小时数据，并同步刷新地图、图表与结论。" },
  ]);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const isTourism = input.activityType === "旅游规划";

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
    setGrid([]);
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
    const controller = new AbortController();
    queueMicrotask(() => void loadCity(meta, controller.signal));
    return () => controller.abort();
  }, [meta, loadCity]);

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
      setDateRange({ min: today, max: dateString(4) });
      setInput((current) => current.date ? current : { ...current, date: today, endDate: today });
    });
  }, []);

  const updateInput = <K extends keyof ActivityInput>(key: K, value: ActivityInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  const applyActivityLocation = useCallback((location: MapSelection & { province?: string; city?: string }) => {
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

  const changeCity = (cityId: string) => {
    const nextCity = cityById(cityId);
    const option: CityOption = { id: nextCity.id, name: nextCity.name, province: nextCity.province, adcode: nextCity.adcode, center: nextCity.center };
    saveSelectedCity(option);
    setIsLoadingCity(true);
    setError(null);
    setCity(null);
    setResult(null);
    setRoute(null);
    setSelectedDistrict("");
    setInput((current) => ({
      ...current,
      cityId,
      cityName: nextCity.name,
      province: nextCity.province,
      adcode: nextCity.adcode,
      longitude: nextCity.center[0],
      latitude: nextCity.center[1],
      locationName: `${nextCity.name.replace("市", "")}活动场地`,
    }));
  };

  const locateCurrentCity = () => {
    setIsLocating(true);
    setError(null);
    const applyLocation = (longitude: number, latitude: number, name: string, province: string, district: string, adcode: string, precise: boolean) => {
      const option: CityOption = { id: "geo-current", name, province, adcode, center: [longitude, latitude] };
      saveSelectedCity(option);
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
    const startedAt = Date.now();
    try {
      const response = await fetch(`${apiBase}/api/v2/agent/stream`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(activity),
      });
      if (!response.ok) throw new Error(await apiError(response));
      const decision = await readAgentStream(response, (item) => setLiveTrace((current) => [...current, item]));
      setResult(decision);
      setLiveTrace([]);
      setRoute(null);
      await loadCity(targetMeta);
      setActivePanel("plan");
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "决策服务暂时不可用");
    } finally {
      const elapsed = Date.now() - startedAt;
      window.setTimeout(() => setIsAnalyzing(false), Math.max(0, 520 - elapsed));
    }
  }

  async function planTourism(activity: ActivityInput = input, targetMeta: CityOption = meta) {
    setIsPlanning(true);
    setError(null);
    try {
      const start = new Date(`${activity.date || dateString()}T00:00:00+08:00`);
      const end = new Date(`${activity.endDate || activity.date || dateString()}T00:00:00+08:00`);
      const dates: string[] = [];
      for (let cursor = start; cursor <= end && dates.length < 5; cursor = new Date(cursor.getTime() + 86400000)) {
        dates.push(cursor.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }));
      }
      const hourlyDays = await Promise.all(dates.map(async (date) => {
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
      const data = await fetchTourismRoute(apiBase, {
        cityName: targetMeta.name,
        province: targetMeta.province,
        longitude: targetMeta.center[0],
        latitude: targetMeta.center[1],
        date: activity.date || dateString(),
        endDate: activity.endDate || activity.date || dateString(),
        hours: hourlyDays.flat(),
      });
      setRoute(data);
      setResult(null);
      setActivePanel("plan");
    } catch (caught) {
      setRoute(null);
      setError(caught instanceof Error ? caught.message : "旅游路线服务暂时不可用");
    } finally {
      setIsPlanning(false);
    }
  }

  async function submitConversation() {
    const message = chatText.trim();
    if (!message || chatBusy) return;
    const userMessage: ChatMessage = { role: "user", content: message };
    const history = [...chatMessages, userMessage];
    setChatMessages(history);
    setChatText("");
    setChatBusy(true);
    setError(null);
    try {
      const response = await fetch("/conversation-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message, today: dateString(), context: input, history: history.slice(-6),
        }),
      });
      if (!response.ok) throw new Error(await apiError(response));
      const plan = await response.json() as ConversationResponse;
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
      setParticipantsText(String(Math.max(1, nextInput.participants)).padStart(4, "0"));
      setResult(null);
      setRoute(null);
      setChatMessages((current) => [...current, { role: "assistant", content: `${plan.reply}${plan.provider ? `（${plan.provider}）` : ""}` }]);
      if (plan.command === "clarify") return;
      await loadCity(targetMeta);
      if (nextInput.activityType === "旅游规划") await planTourism(nextInput, targetMeta);
      else await analyze(nextInput, targetMeta);
      setChatMessages((current) => [...current, { role: "assistant", content: "分析已完成：表单、中心地图、逐小时图表和右侧结论均已按本轮要求更新。你可以继续说“改成一小时”或“为什么推荐这个时段”。" }]);
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
    ? result.slots.filter((slot) => !result.bestSlot.date || slot.date === result.bestSlot.date)
    : [];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true"><Compass size={23} weight="duotone" /></div>
          <div><p className="brand-name">适候</p><p className="brand-subtitle">户外活动环境决策系统</p></div>
        </div>
        <div className="topbar-context"><ChatCircleDots size={16} weight="duotone" /><span>用一句话完成查询、分析与可视化</span></div>
        <div className="topbar-actions">
          <span className={`system-status ${error ? "has-error" : ""}`}><i /> {error ? "数据连接异常" : isLoadingCity ? "正在同步实时数据" : `实时数据 · ${updatedAt}`}</span>
          <Link className="icon-button" href="/hourly" title="逐小时数据" aria-label="逐小时数据页面"><Clock size={18} /></Link>
          <Link className="icon-button" href="/welcome" title="平台介绍" aria-label="平台介绍"><MapTrifold size={18} /></Link>
          <Link className="icon-button" href="/settings" title="AI 模型配置" aria-label="AI 模型配置页面"><GearSix size={18} /></Link>
          <AccountBadge />
        </div>
      </header>

      <section className="workspace">
        <aside className="control-rail">
          <div className="rail-heading">
            <div><span className="section-kicker">辅助条件</span><h1>校准分析范围</h1></div>
            <button type="button" className="icon-button compact" onClick={() => { const sameCity = input.cityId === initialInput.cityId; const today = dateString(); setError(null); setResult(null); setRoute(null); setSelectedDistrict(""); setParticipantsText("0500"); setInput({ ...initialInput, date: today, endDate: today }); if (!sameCity) { setIsLoadingCity(true); setCity(null); } else { void loadCity(cityById(initialInput.cityId)); } }} aria-label="重置活动条件"><ArrowClockwise size={17} /></button>
          </div>

          <section className="control-section" aria-labelledby="place-section-title">
          <div className="control-section-title" id="place-section-title"><MapPin size={15} /><span>地点与实时环境</span></div>
          <FieldLabel htmlFor="city">所在城市</FieldLabel>
          <div className="select-wrap"><MapPin size={17} /><select id="city" value={cities.some((item) => item.id === input.cityId) ? input.cityId : ""} onChange={(event) => changeCity(event.target.value)}>
            {cities.some((item) => item.id === input.cityId) ? null : <option value="">{meta.name}（搜索城市）</option>}
            {cities.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.province}</option>)}
          </select><CaretDown size={14} /></div>

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
          {city && <dl className="city-detail-grid" aria-label="所选城市详细环境信息"><div><dt>天气</dt><dd>{city.weather}</dd></div><div><dt>PM2.5</dt><dd>{city.pm25} μg/m³</dd></div><div><dt>风力</dt><dd>{city.windPower}级</dd></div><div><dt>降雨</dt><dd>{city.rainProbability}%</dd></div></dl>}

          </section>

          <section className="control-section" aria-labelledby="time-section-title">
          <div className="control-section-title" id="time-section-title"><CalendarBlank size={15} /><span>日期与时段</span></div>
          <div className="field-grid date-range-grid">
            <div><FieldLabel htmlFor="date">开始日期</FieldLabel><div className="input-wrap"><CalendarBlank size={17} /><input id="date" type="date" min={dateRange.min} max={dateRange.max} value={input.date} onChange={(event) => { const date = event.target.value; setInput((current) => ({ ...current, date, endDate: !current.endDate || current.endDate < date ? date : current.endDate })); setResult(null); setRoute(null); }} /></div></div>
            <div><FieldLabel htmlFor="end-date">结束日期</FieldLabel><div className="input-wrap"><CalendarBlank size={17} /><input id="end-date" type="date" min={input.date || dateRange.min} max={dateRange.max} value={input.endDate || input.date} onChange={(event) => { updateInput("endDate", event.target.value); setResult(null); setRoute(null); }} /></div></div>
          </div>
          <FieldLabel htmlFor="hour">每日开始时间</FieldLabel><div className="select-wrap no-icon"><select id="hour" value={input.startHour} onChange={(event) => updateInput("startHour", Number(event.target.value))}>{Array.from({ length: 15 }, (_, index) => index + 6).map((hour) => <option value={hour} key={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select><CaretDown size={14} /></div>
          </section>

          <section className="control-section" aria-labelledby="activity-section-title">
          <div className="control-section-title" id="activity-section-title"><Lightning size={15} /><span>活动场景</span></div>
          <div className="activity-type-grid" role="group" aria-label="选择活动类型">
            {activityTypes.map((item) => { const Icon = activityIcons[item]; return <button type="button" key={item} className={input.activityType === item ? "is-selected" : ""} onClick={() => { updateInput("activityType", item); setResult(null); setRoute(null); }}><Icon size={17} weight={input.activityType === item ? "fill" : "regular"} /><span>{item}</span></button>; })}
          </div>
          <p className="activity-profile"><strong>{activityProfiles[input.activityType].focus}</strong><span>{activityProfiles[input.activityType].detail}</span></p>
          </section>

          <details className="advanced-settings">
          <summary><span><UsersThree size={15} />更多设置</span><CaretDown size={14} /></summary>
          <div className="advanced-settings-body">
          <div className="control-section-title" id="people-section-title"><UsersThree size={15} /><span>规模与参与者</span></div>
          <div className="field-grid">
            <div><FieldLabel htmlFor="participants">参与人数</FieldLabel><div className="input-wrap"><UsersThree size={17} /><input id="participants" type="text" inputMode="numeric" value={participantsText} onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 5); setParticipantsText(digits); if (digits) updateInput("participants", Math.max(1, Number(digits))); }} onBlur={() => setParticipantsText(String(Math.max(1, input.participants)).padStart(4, "0"))} /></div></div>
            <div><FieldLabel htmlFor="duration">时长</FieldLabel><div className="select-wrap no-icon"><select id="duration" value={input.duration} onChange={(event) => updateInput("duration", Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((hour) => <option value={hour} key={hour}>{hour} 小时</option>)}</select><CaretDown size={14} /></div></div>
          </div>
          <FieldLabel>活动强度</FieldLabel>
          <div className="segmented-control">{intensities.map((item) => <button type="button" key={item} className={input.intensity === item ? "is-selected" : ""} onClick={() => updateInput("intensity", item)}>{item.replace("强度", "")}</button>)}</div>
          <FieldLabel htmlFor="group">参与人群</FieldLabel>
          <div className="select-wrap"><UsersThree size={17} /><select id="group" value={input.group} onChange={(event) => { setResult(null); setRoute(null); updateInput("group", event.target.value as GroupType); }}>{groups.map((item) => <option value={item} key={item}>{item}</option>)}</select><CaretDown size={14} /></div>
          {isTourism && (
            <p className="tourism-hint"><Binoculars size={16} /> 旅游模式：结合逐小时天气、公开文旅资料与平台检索入口，编排景点＋美食路线并绘制在地图上。</p>
          )}
          <VenuePhotoAnalysis activityType={input.activityType} locationName={input.locationName} onAnalysis={(siteObservation) => setInput((current) => ({ ...current, siteObservation }))} />
          </div>
          </details>
          {error && <div className="error-notice" role="alert"><WarningCircle size={17} /><span>{error}</span></div>}
          <button className="analyze-button" type="button" onClick={() => void (isTourism ? planTourism() : analyze())} disabled={isAnalyzing || isPlanning || isLoadingCity || !city || !input.date}>
            {isAnalyzing || isPlanning ? <span className="button-loader" /> : <Sparkle size={19} weight="fill" />}
            {isAnalyzing ? "Agent 正在分析" : isPlanning ? "AI 正在编排路线" : isTourism ? "生成旅游路线" : "生成活动决策"}
          </button>
          <p className="rail-footnote"><ShieldCheck size={14} /> 实时预报计算，AI 仅生成可解释文字</p>
        </aside>

        <section className="map-workbench">
          <section className={`analysis-console ${chatOpen ? "is-expanded" : ""}`} aria-label="对话驱动数据分析">
            <div className="analysis-console-head">
              <div><span className="conversation-icon"><ChatCircleDots size={19} weight="duotone" /></span><div><strong>对话分析</strong><small>描述城市、日期与活动，系统会直接更新数据、地图和结论</small></div></div>
              <button type="button" className="conversation-history-toggle" onClick={() => setChatOpen((value) => !value)}>{chatOpen ? "收起记录" : `对话记录${chatMessages.length > 1 ? ` · ${chatMessages.length - 1}` : ""}`}</button>
            </div>
            {chatOpen && <div className="conversation-messages" aria-live="polite">{chatMessages.map((message, index) => <div className={`conversation-message is-${message.role}`} key={`${message.role}-${index}`}>{message.content}</div>)}{chatBusy && <div className="conversation-message is-assistant is-thinking"><span className="button-loader dark" />正在理解条件并调用分析工具…</div>}</div>}
            {!chatOpen && chatMessages.length > 1 && <p className="conversation-latest">{chatMessages.at(-1)?.content}</p>}
            <form className="analysis-console-form" onSubmit={(event) => { event.preventDefault(); void submitConversation(); }}>
              <textarea value={chatText} onChange={(event) => setChatText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitConversation(); } }} placeholder="例如：分析西安明天下午哪个时段适合举办两小时运动会" rows={1} />
              <button type="submit" disabled={!chatText.trim() || chatBusy} aria-label="发送分析要求">{chatBusy ? <span className="button-loader" /> : <PaperPlaneTilt size={18} weight="fill" />}<span>开始分析</span></button>
            </form>
            {chatMessages.length === 1 && <div className="conversation-suggestions"><button type="button" onClick={() => setChatText("分析西安明天下午哪个时段适合举办两小时运动会")}>西安明天下午运动会</button><button type="button" onClick={() => setChatText("规划杭州未来三天的旅游路线")}>杭州三日旅游路线</button></div>}
          </section>
          <div className="city-summary">
            <div><span className="section-kicker">{meta.province} · {meta.adcode} · {city ? `实况更新 ${updatedAt}` : "正在连接数据源"}</span><h2>{meta.name}{selectedDistrict ? ` · ${selectedDistrict}` : ""}当前环境空间图</h2></div>
            <div className="city-metrics" aria-label="城市环境概览">
              <Metric icon={ThermometerSimple} value={city ? `${city.temperature}°` : "--"} label="气温" />
              <Metric icon={Drop} value={city ? `${city.humidity}%` : "--"} label="湿度" />
              <Metric icon={Wind} value={city ? `${city.aqi}` : "--"} label="US AQI" />
              <Metric icon={CloudSun} value={city ? `${city.heatRisk}` : "--"} label="热风险" />
            </div>
          </div>
          <div className="layer-bar" aria-label="环境图层">{layers.map((item) => { const Icon = item.icon; return <button type="button" key={item.key} className={layer === item.key ? "is-active" : ""} onClick={() => setLayer(item.key)}><Icon size={16} /> {item.label}</button>; })}</div>
          {city
            ? <EnvironmentMap city={city} layer={layer} onPointSelected={onPointSelected} onRegionBounds={onRegionBounds} grid={grid} route={route} />
            : <div className="map-shell map-unavailable"><span className="button-loader dark" /><p>{error ? "实时数据暂不可用" : "正在载入城市环境数据"}</p></div>}
          <div className="timeline-card">
            <div className="timeline-header"><div><span className="section-kicker">活动日期逐小时预测 · {input.date || "待选择日期"}</span><h3>{isTourism ? "旅游路线 · 推荐出行时段" : "候选时段活动适宜度"}</h3></div><div className="legend"><span className="good" />适宜 <span className="caution" />谨慎 <span className="bad" />不建议</div></div>
            {isTourism
              ? <div className="timeline-empty">{route ? `推荐时段：${route.bestHours}` : "选择城市与日期后生成旅游路线"}</div>
              : result
                ? <div className="slot-chart">{visibleSlots.map((slot) => { const isBest = slot.hour === result.bestSlot.hour && slot.date === result.bestSlot.date; return <button type="button" key={`${slot.date}-${slot.hour}`} className={`slot-column ${isBest ? "is-best" : ""}`} onClick={() => setInput((current) => ({ ...current, date: slot.date || current.date, startHour: slot.hour }))} aria-label={`${slot.label}适宜度${slot.score}`}><span className="slot-score">{isBest ? slot.score : ""}</span><span className={`slot-bar level-${slot.level}`} style={{ height: `${Math.max(18, slot.score)}%` }} /><span className="slot-time">{slot.hour}</span></button>; })}</div>
                : <div className="timeline-empty">选择活动条件后生成逐小时决策</div>}
            {!isTourism && result && <Link className="timeline-more" href="/hourly">查看完整逐小时页面 →</Link>}
          </div>
        </section>

        <DecisionResultPanel input={input} isTourism={isTourism} route={route} result={result} liveTrace={liveTrace} activePanel={activePanel} onPanel={setActivePanel} isPlanning={isPlanning} isAnalyzing={isAnalyzing} />
      </section>
    </main>
  );
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) { return <label className="field-label" htmlFor={htmlFor}>{children}</label>; }
function Metric({ icon: Icon, value, label }: { icon: typeof Gauge; value: string; label: string }) { return <div className="metric-item"><Icon size={18} /><div><strong>{value}</strong><span>{label}</span></div></div>; }
