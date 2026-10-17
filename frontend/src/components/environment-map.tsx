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
  setFitView?(padding?: number[]): void;
  setCenter?(position: [number, number]): void;
}

type OverlayCtor = new (options: Record<string, unknown>) => unknown;

interface AMapNamespace {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: OverlayCtor;
  CircleMarker: OverlayCtor;
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

export function EnvironmentMap({ city, layer, onPointSelected, grid, route }: EnvironmentMapProps) {
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
      ? { 0: "#ef4444", 0.45: "#f6c453", 0.7: "#36d399", 1: "#087f6d" }
      : { 0: "#24c7e8", 0.38: "#38d39f", 0.62: "#f1d34f", 0.82: "#f4933f", 1: "#df3f50" };
    const heatMap = new AMap.HeatMap(map, {
      radius: 72,
      opacity: [0.16, 0.82],
      gradient,
      zooms: [7, 17],
    });
    const data = (grid ?? []).map((point) => {
      const value = metricValue(point, layer);
      const normalized = legend.max > legend.min ? (value - legend.min) / (legend.max - legend.min) : 0.55;
      return { lng: point.longitude, lat: point.latitude, count: 20 + normalized * 80 };
    });
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
    map.setFitView?.([70, 70, 70, 70]);
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
          ? (route ? "高德地图 · 路线绘制" : "高德地图 · 网格热力图")
          : mapState === "error" ? "高德地图鉴权待配置" : "城市坐标 · 实时数据"}
      </div>
    </div>
  );
}
