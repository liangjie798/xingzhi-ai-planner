"use client";

/// <reference types="@amap/amap-jsapi-types" />

import { Crosshair, MapPin, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CityEnvironment, GridPoint, LayerKey, TourismRoute } from "@/lib/types";

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode?: string; serviceHost?: string };
  }
}

interface MapInstance {
  destroy(): void;
  add(target: unknown): void;
  remove(target: unknown): void;
  on(event: string, handler: (event: { lnglat: { getLng: () => number; getLat: () => number } }) => void): void;
  setFitView?(overlays?: unknown[], immediately?: boolean, avoid?: number[], maxZoom?: number): void;
  setCenter?(position: [number, number]): void;
}

type OverlayCtor = new (options: Record<string, unknown>) => unknown;

interface AMapNamespace {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: OverlayCtor;
  CircleMarker: OverlayCtor;
  Polygon: OverlayCtor;
  Polyline: OverlayCtor;
  HeatMap: new (map: MapInstance, options: Record<string, unknown>) => { setDataSet(data: Record<string, unknown>): void; setMap?(map: MapInstance | null): void };
  Scale: OverlayCtor;
  ToolBar: OverlayCtor;
  getConfig?: () => { appname?: string };
}

interface EnvironmentMapProps {
  city: CityEnvironment;
  layer: LayerKey;
  onPointSelected: (name: string) => void;
  onRegionBounds?: (bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number }) => void;
  grid?: GridPoint[];
  route?: TourismRoute | null;
}

const layerLabel: Record<LayerKey, string> = {
  comfort: "活动适宜度",
  temperature: "实时气温",
  humidity: "相对湿度",
  aqi: "空气质量",
  heat: "热风险",
};

const layerUnit: Record<LayerKey, string> = { comfort: "分", temperature: "°C", humidity: "%", aqi: "", heat: "" };

function metricValue(point: GridPoint | CityEnvironment, layer: LayerKey): number {
  if (layer === "temperature") return point.temperature;
  if (layer === "humidity") return point.humidity;
  if (layer === "aqi") return point.aqi;
  if (layer === "heat") return point.heatRisk;
  const source = point as GridPoint;
  const heatRisk = "heatRisk" in source ? source.heatRisk : 0;
  const aqi = "aqi" in source ? source.aqi : 0;
  const rain = "rainProbability" in source ? source.rainProbability : 0;
  return Math.round(Math.max(0, 100 - heatRisk * 0.42 - Math.max(0, aqi - 35) * 0.21 - rain * 0.18));
}

/** 数据程度 → 颜色深浅（浅青 → 深青），返回 hex 颜色 */
function shadeFor(value: number, min: number, max: number): string {
  const t = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0.5;
  const from = [199, 228, 222];
  const to = [4, 73, 62];
  const rgb = from.map((channel, index) => Math.round(channel + (to[index] - channel) * t));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/**
 * 将后端的稀疏气象采样点插值成高密度连续网格。
 * AMap.HeatMap 直接渲染 3x3 点会暴露每个点的圆形核；密集网格会把核融合为连续色带。
 */
function interpolateSurface(points: GridPoint[], layer: LayerKey) {
  if (points.length < 2) return [];
  const longitudes = points.map((point) => point.longitude);
  const latitudes = points.map((point) => point.latitude);
  const sourceMinLng = Math.min(...longitudes);
  const sourceMaxLng = Math.max(...longitudes);
  const sourceMinLat = Math.min(...latitudes);
  const sourceMaxLat = Math.max(...latitudes);
  const lngSpan = Math.max(0.01, sourceMaxLng - sourceMinLng);
  const latSpan = Math.max(0.01, sourceMaxLat - sourceMinLat);
  // 略微越过行政区外接范围并在边缘羽化，覆盖全域同时避免污染相邻城市。
  const minLng = sourceMinLng - lngSpan * 0.08;
  const minLat = sourceMinLat - latSpan * 0.08;
  const renderLngSpan = lngSpan * 1.16;
  const renderLatSpan = latSpan * 1.16;
  const values = points.map((point) => metricValue(point, layer));
  const valueMin = Math.min(...values);
  const valueMax = Math.max(...values);
  const resolution = 27;
  const surface: Array<{ lng: number; lat: number; count: number }> = [];

  for (let row = 0; row < resolution; row += 1) {
    const y = row / (resolution - 1);
    const latitude = minLat + renderLatSpan * y;
    for (let column = 0; column < resolution; column += 1) {
      const x = column / (resolution - 1);
      const longitude = minLng + renderLngSpan * x;
      let weightedValue = 0;
      let weightSum = 0;

      points.forEach((point) => {
        const dx = (longitude - point.longitude) / lngSpan;
        const dy = (latitude - point.latitude) / latSpan;
        const distanceSquared = dx * dx + dy * dy;
        const weight = 1 / Math.pow(distanceSquared + 0.0025, 1.35);
        weightedValue += metricValue(point, layer) * weight;
        weightSum += weight;
      });

      const value = weightedValue / weightSum;
      const normalized = valueMax > valueMin ? (value - valueMin) / (valueMax - valueMin) : 0.55;
      // 边缘逐渐变淡，避免出现矩形边界；轻微空间起伏让色带更接近自然气象分布。
      const edge = Math.min(x, 1 - x, y, 1 - y) * 2;
      const edgeWobble = edge * 3.25 + Math.sin(x * 17 + y * 7) * 0.12 + Math.cos(y * 15 - x * 5) * 0.09;
      const feather = Math.pow(Math.min(1, Math.max(0, edgeWobble)), 0.72);
      const texture = 0.94 + 0.06 * Math.sin(x * 15 + y * 9);
      surface.push({
        lng: +longitude.toFixed(5),
        lat: +latitude.toFixed(5),
        count: (5 + normalized * 95) * feather * texture,
      });
    }
  }
  return surface;
}

export function EnvironmentMap({ city, layer, onPointSelected, onRegionBounds, grid, route }: EnvironmentMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialCenterRef = useRef(city.center);
  const mapRef = useRef<MapInstance | null>(null);
  const amapRef = useRef<AMapNamespace | null>(null);
  const [mapState, setMapState] = useState<"loading" | "ready" | "coordinates" | "error">("loading");
  const amapKey = process.env.NEXT_PUBLIC_AMAP_KEY;
  const securityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;
  const serviceHost = process.env.NEXT_PUBLIC_AMAP_SERVICE_HOST;

  const gridValues = useMemo(() => (grid ?? []).map((point) => metricValue(point, layer)), [grid, layer]);
  const legend = useMemo(() => {
    const fallback = metricValue(city, layer);
    const values = gridValues.length ? gridValues : [fallback];
    return { min: Math.min(...values), max: Math.max(...values), unit: layerUnit[layer] };
  }, [gridValues, city, layer]);
  const pointLabel = useMemo(() => {
    const value = metricValue(city, layer);
    return `${layer === "temperature" ? `${value}°` : layer === "humidity" ? `${value}%` : value}`;
  }, [city, layer]);

  // 建图（城市切换时重建）
  useEffect(() => {
    if (!amapKey || !containerRef.current) {
      setMapState("coordinates");
      return;
    }

    window._AMapSecurityConfig = serviceHost ? { serviceHost } : { securityJsCode: securityCode };
    let cancelled = false;
    setMapState("loading");

    import("@amap/amap-jsapi-loader").then(({ default: AMapLoader }) => AMapLoader.load({
      key: amapKey,
      version: "2.0",
      plugins: ["AMap.Scale", "AMap.ToolBar", "AMap.Geocoder", "AMap.HeatMap"],
    }))
      .then((loaded) => {
        const AMap = loaded as unknown as AMapNamespace;
        if (AMap.getConfig) AMap.getConfig().appname = "amap-jsapi-skill";
        if (cancelled || !containerRef.current) return;
        const map = new AMap.Map(containerRef.current, {
          viewMode: "3D",
          zoom: 11.2,
          pitch: 30,
          center: initialCenterRef.current,
          mapStyle: "amap://styles/whitesmoke",
          showLabel: true,
        });
        map.add(new AMap.Scale({ position: "LB" }));
        map.add(new AMap.ToolBar({ position: "RB", liteStyle: true }));
        map.on("click", (event) => {
          const point = event.lnglat;
          onPointSelected(`地图选点 ${point.getLng().toFixed(4)}, ${point.getLat().toFixed(4)}`);
        });
        amapRef.current = AMap;
        mapRef.current = map;
        setMapState("ready");
      })
      .catch(() => setMapState("error"));

    return () => {
      cancelled = true;
      const mapToDestroy = mapRef.current;
      mapRef.current = null;
      amapRef.current = null;
      // 让后续图层 effect 先从仍存活的地图解绑，再销毁底图实例。
      window.setTimeout(() => mapToDestroy?.destroy(), 0);
    };
  }, [amapKey, securityCode, serviceHost, onPointSelected]);

  useEffect(() => {
    if (mapState === "ready") mapRef.current?.setCenter?.(city.center);
  }, [mapState, city.center]);

  // 使用阿里云 DataV 中国大陆公开行政区 GeoJSON，让视野与采样范围覆盖完整城市/区县。
  useEffect(() => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (mapState !== "ready" || !AMap || !map || !onRegionBounds) return;
    let active = true;
    let boundaryOverlays: unknown[] = [];
    const fallback = () => {
      if (!active) return;
      const [longitude, latitude] = city.center;
      onRegionBounds({
        minLng: longitude - 0.32,
        maxLng: longitude + 0.32,
        minLat: latitude - 0.24,
        maxLat: latitude + 0.24,
      });
    };
    const controller = new AbortController();
    const collectRings = (node: unknown, rings: number[][][]) => {
      if (!Array.isArray(node) || node.length === 0) return;
      if (Array.isArray(node[0]) && typeof node[0][0] === "number") {
        rings.push(node as number[][]);
        return;
      }
      node.forEach((child) => collectRings(child, rings));
    };
    void (async () => {
      if (!/^\d{6}$/.test(city.adcode ?? "")) {
        fallback();
        return;
      }
      try {
        const response = await fetch(`/api/region/${city.adcode}`, { signal: controller.signal });
        if (!response.ok) throw new Error("行政区边界不可用");
        const geoJson = await response.json() as { features?: Array<{ geometry?: { coordinates?: unknown } }> };
        const rings: number[][][] = [];
        geoJson.features?.forEach((feature) => collectRings(feature.geometry?.coordinates, rings));
        const points = rings.flat();
        if (!active || points.length < 3) throw new Error("行政区边界为空");
        boundaryOverlays = rings.map((ring) => new AMap.Polygon({
          path: ring,
          strokeColor: "#087f6d",
          strokeWeight: 1.5,
          strokeOpacity: 0.66,
          fillColor: "#dff3ed",
          fillOpacity: 0.025,
        }));
        map.add(boundaryOverlays);
        map.setFitView?.(boundaryOverlays, true, [34, 34, 34, 34], 10);
        const longitudes = points.map((point) => point[0]);
        const latitudes = points.map((point) => point[1]);
        onRegionBounds({
          minLng: Math.min(...longitudes),
          maxLng: Math.max(...longitudes),
          minLat: Math.min(...latitudes),
          maxLat: Math.max(...latitudes),
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) fallback();
      }
    })();
    return () => {
      active = false;
      controller.abort();
      if (boundaryOverlays.length) map.remove(boundaryOverlays);
    };
  }, [mapState, city.id, city.name, city.adcode, city.center, onRegionBounds]);

  // 图层着色：城市网格预报经高德 HeatMap 平滑插值，形成连续程度色带
  useEffect(() => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (mapState !== "ready" || !AMap || !map) return;

    const isCurrentLocation = city.id === "geo-current";
    const centerMarker = new AMap.Marker({
      position: city.center,
      title: `${city.name} ${layerLabel[layer]} ${pointLabel}`,
      content: isCurrentLocation ? '<div class="user-location-marker"><span></span></div>' : undefined,
      label: { content: `${isCurrentLocation ? "你的位置 · " : ""}${layerLabel[layer]} ${pointLabel}`, direction: "top" },
    });
    map.add(centerMarker);

    const highIsGood = layer === "comfort";
    const gradient = highIsGood
      ? { 0: "rgba(239,68,68,0)", 0.28: "rgba(246,196,83,.48)", 0.58: "#5bd5aa", 0.8: "#22b99a", 1: "#087f6d" }
      : { 0: "rgba(36,199,232,0)", 0.22: "rgba(36,199,232,.54)", 0.45: "#38d39f", 0.66: "#f1d34f", 0.84: "#f4933f", 1: "#df3f50" };
    const heatMap = new AMap.HeatMap(map, {
      radius: 30,
      opacity: [0.05, 0.78],
      gradient,
      zooms: [7, 17],
    });
    const data = interpolateSurface(grid ?? [], layer);
    if (data.length) heatMap.setDataSet({ data, max: 100 });
    return () => {
      map.remove(centerMarker);
      heatMap.setMap?.(null);
    };
  }, [mapState, city, layer, pointLabel, grid, legend]);

  // 旅游路线：折线 + 编号站点
  useEffect(() => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (mapState !== "ready" || !AMap || !map || !route) return;

    const stops = route.stops.filter((stop): stop is typeof stop & { longitude: number; latitude: number } =>
      stop.longitude != null && stop.latitude != null);
    if (stops.length < 2) return;

    const path = stops.map((stop) => [stop.longitude, stop.latitude]);
    const overlays: unknown[] = [
      new AMap.Polyline({
        path,
        strokeColor: "#056655",
        strokeWeight: 5,
        strokeOpacity: 0.92,
        lineJoin: "round",
        showDir: true,
      }),
    ];
    stops.forEach((stop, index) => {
      overlays.push(new AMap.Marker({
        position: [stop.longitude, stop.latitude],
        content: `<div class="route-badge" title="${stop.name}">${index + 1}</div>`,
        offset: [-13, -13],
        title: stop.name,
      }));
    });
    map.add(overlays);
    map.setFitView?.(overlays, false, [70, 70, 70, 70], 13);
    return () => {
      map.remove(overlays);
    };
  }, [mapState, route]);

  const showFallback = mapState === "coordinates" || mapState === "error";
  const gridBounds = useMemo(() => {
    const points = grid ?? [];
    if (!points.length) return null;
    return {
      minLng: Math.min(...points.map((point) => point.longitude)),
      maxLng: Math.max(...points.map((point) => point.longitude)),
      minLat: Math.min(...points.map((point) => point.latitude)),
      maxLat: Math.max(...points.map((point) => point.latitude)),
    };
  }, [grid]);
  const routeStops = useMemo(
    () => (route?.stops ?? []).filter((stop): stop is typeof stop & { longitude: number; latitude: number } =>
      stop.longitude != null && stop.latitude != null),
    [route],
  );

  const projectToCanvas = (longitude: number, latitude: number) => {
    if (!gridBounds) return null;
    const x = 16 + 68 * ((longitude - gridBounds.minLng) / Math.max(1e-6, gridBounds.maxLng - gridBounds.minLng));
    const y = 84 - 68 * ((latitude - gridBounds.minLat) / Math.max(1e-6, gridBounds.maxLat - gridBounds.minLat));
    return { x, y };
  };

  return (
    <div className="map-shell">
      <div ref={containerRef} className={`amap-canvas ${showFallback ? "is-hidden" : ""}`} />

      {showFallback && (
        <div className="coordinate-canvas" role="img" aria-label={`${city.name}${layerLabel[layer]}城市坐标视图`}>
          <div className="map-orbit orbit-one" />
          <div className="map-orbit orbit-two" />
          <div className="river-line" />
          {(grid ?? []).map((point, index) => {
            const position = projectToCanvas(point.longitude, point.latitude);
            if (!position) return null;
            const value = metricValue(point, layer);
            return (
              <span
                key={`${point.longitude}-${point.latitude}-${index}`}
                className="grid-dot"
                style={{
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                  background: shadeFor(value, legend.min, legend.max),
                }}
                title={`${layerLabel[layer]} ${value}${legend.unit}`}
              />
            );
          })}
          {routeStops.length > 1 && (
            <svg className="route-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline
                points={routeStops.map((stop) => {
                  const position = projectToCanvas(stop.longitude, stop.latitude);
                  return position ? `${position.x},${position.y}` : "";
                }).filter(Boolean).join(" ")}
                fill="none"
                stroke="rgba(232,255,248,.92)"
                strokeWidth="0.7"
                strokeDasharray="2.2 1.4"
              />
            </svg>
          )}
          {routeStops.map((stop, index) => {
            const position = projectToCanvas(stop.longitude, stop.latitude);
            if (!position) return null;
            return <span key={`${stop.name}-${index}`} className="route-badge fallback" style={{ left: `${position.x}%`, top: `${position.y}%` }}>{index + 1}</span>;
          })}
          <button type="button" className="map-node city-coordinate-node" onClick={() => onPointSelected(`${city.name}中心活动点`)} aria-label={`选择${city.name}中心坐标`}>
            <span className="node-halo" />
            <strong>{pointLabel}</strong>
            <small>{city.name}</small>
          </button>
          <div className="coordinate-label"><MapPin size={14} weight="fill" />{city.center[0].toFixed(4)}, {city.center[1].toFixed(4)}</div>
        </div>
      )}

      {mapState === "loading" && <div className="map-loading" aria-live="polite"><span /><p>正在载入城市空间图层</p></div>}

      <div className="map-legend" aria-label={`${layerLabel[layer]}图例`}>
        <span className="map-legend-title">{layerLabel[layer]}</span>
        <span className={`map-legend-bar ${layer === "comfort" ? "is-good" : "is-risk"}`} aria-hidden="true" />
        <span className="map-legend-scale">
          <b>{legend.min}{legend.unit}</b><i>数据程度</i><b>{legend.max}{legend.unit}</b>
        </span>
      </div>

      <div className="map-mode-badge">
        {mapState === "ready" ? <Crosshair size={14} /> : <WarningCircle size={14} />}
        {mapState === "ready"
          ? (route ? "高德地图 · 路线绘制" : "高德地图 · 连续网格色带")
          : mapState === "error" ? "高德地图鉴权待配置" : "城市坐标 · 实时数据"}
      </div>
    </div>
  );
}
