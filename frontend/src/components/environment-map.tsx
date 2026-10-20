"use client";

/// <reference types="@amap/amap-jsapi-types" />

import { Crosshair, MapPin, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { reverseGeocode } from "@/lib/amap-lbs";
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
interface InteractiveOverlay { on(event: string, handler: () => void): void }
interface InfoWindowInstance { open(map: MapInstance, position: [number, number]): void; close(): void }

interface AMapNamespace {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: new (options: Record<string, unknown>) => InteractiveOverlay;
  CircleMarker: OverlayCtor;
  CanvasLayer: OverlayCtor;
  Polygon: OverlayCtor;
  Polyline: OverlayCtor;
  InfoWindow: new (options: Record<string, unknown>) => InfoWindowInstance;
  Scale: OverlayCtor;
  ToolBar: OverlayCtor;
  getConfig?: () => { appname?: string };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

interface EnvironmentMapProps {
  city: CityEnvironment;
  layer: LayerKey;
  onPointSelected: (location: MapSelection) => void;
  onRegionBounds?: (bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number }) => void;
  grid?: GridPoint[];
  route?: TourismRoute | null;
}

export interface MapSelection {
  name: string;
  longitude: number;
  latitude: number;
  district?: string;
  adcode?: string;
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

function mixColor(stops: Array<[number, [number, number, number]]>, value: number) {
  const clamped = Math.min(1, Math.max(0, value));
  const upperIndex = Math.max(1, stops.findIndex(([position]) => position >= clamped));
  const [fromPosition, from] = stops[upperIndex - 1];
  const [toPosition, to] = stops[upperIndex] ?? stops[stops.length - 1];
  const ratio = toPosition > fromPosition ? (clamped - fromPosition) / (toPosition - fromPosition) : 0;
  return from.map((channel, index) => Math.round(channel + (to[index] - channel) * ratio)) as [number, number, number];
}

/** 将稀疏气象采样值逐像素插值，并按真实行政区 GeoJSON 逐像素裁切。 */
function createRasterSurface(points: GridPoint[], layer: LayerKey, rings: number[][][]) {
  if (points.length < 2 || rings.length === 0) return null;
  const boundaryPoints = rings.flat();
  const longitudes = boundaryPoints.map((point) => point[0]);
  const latitudes = boundaryPoints.map((point) => point[1]);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const renderLngSpan = Math.max(0.01, maxLng - minLng);
  const renderLatSpan = Math.max(0.01, maxLat - minLat);
  const values = points.map((point) => metricValue(point, layer));
  const valueMin = Math.min(...values);
  const valueMax = Math.max(...values);
  const colorStops: Array<[number, [number, number, number]]> = layer === "comfort"
    ? [[0, [239, 68, 68]], [0.34, [246, 196, 83]], [0.62, [91, 213, 170]], [0.82, [34, 185, 154]], [1, [8, 127, 109]]]
    : [[0, [36, 199, 232]], [0.3, [56, 211, 159]], [0.58, [241, 211, 79]], [0.8, [244, 147, 63]], [1, [223, 63, 80]]];
  const width = 420;
  const height = Math.min(520, Math.max(260, Math.round(width * renderLatSpan / renderLngSpan)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(width, height);

  for (let row = 0; row < height; row += 1) {
    const y = row / (height - 1);
    const latitude = minLat + renderLatSpan * (1 - y);
    for (let column = 0; column < width; column += 1) {
      const x = column / (width - 1);
      const longitude = minLng + renderLngSpan * x;
      let weightedValue = 0;
      let weightSum = 0;

      points.forEach((point) => {
        const dx = (longitude - point.longitude) / renderLngSpan;
        const dy = (latitude - point.latitude) / renderLatSpan;
        const distanceSquared = dx * dx + dy * dy;
        const weight = 1 / Math.pow(distanceSquared + 0.0025, 1.35);
        weightedValue += metricValue(point, layer) * weight;
        weightSum += weight;
      });

      const value = weightedValue / weightSum;
      const normalized = valueMax > valueMin ? (value - valueMin) / (valueMax - valueMin) : 0.55;
      const [red, green, blue] = mixColor(colorStops, normalized);
      const offset = (row * width + column) * 4;
      image.data[offset] = red;
      image.data[offset + 1] = green;
      image.data[offset + 2] = blue;
      image.data[offset + 3] = 205;
    }
  }
  context.putImageData(image, 0, 0);

  // 让浏览器原生 Canvas 路径引擎一次完成复杂多边形裁切，避免逐像素遍历数万条边界线。
  context.save();
  context.globalCompositeOperation = "destination-in";
  context.beginPath();
  rings.forEach((ring) => {
    ring.forEach(([longitude, latitude], index) => {
      const x = (longitude - minLng) / renderLngSpan * width;
      const y = (maxLat - latitude) / renderLatSpan * height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
  });
  context.fillStyle = "#000";
  context.fill("evenodd");
  context.restore();
  return { canvas, bounds: [minLng, minLat, maxLng, maxLat] as [number, number, number, number] };
}

export function EnvironmentMap({ city, layer, onPointSelected, onRegionBounds, grid, route }: EnvironmentMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialCenterRef = useRef(city.center);
  const mapRef = useRef<MapInstance | null>(null);
  const amapRef = useRef<AMapNamespace | null>(null);
  const [mapState, setMapState] = useState<"loading" | "ready" | "coordinates" | "error">("loading");
  const [regionRings, setRegionRings] = useState<number[][][]>([]);
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
      plugins: ["AMap.Scale", "AMap.ToolBar"],
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
          const longitude = point.getLng();
          const latitude = point.getLat();
          void reverseGeocode(longitude, latitude)
            .then((result) => onPointSelected(result))
            .catch(() => onPointSelected({
              name: `地图选点 ${longitude.toFixed(4)}, ${latitude.toFixed(4)}`,
              longitude,
              latitude,
            }));
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
    setRegionRings([]);
    let boundaryOverlays: unknown[] = [];
    let boundaryLabels: unknown[] = [];
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
        const response = await fetch(`/region-data/${city.adcode}`, { signal: controller.signal });
        if (!response.ok) throw new Error("行政区边界不可用");
        const geoJson = await response.json() as { features?: Array<{
          properties?: { name?: string; center?: [number, number]; centroid?: [number, number] };
          geometry?: { coordinates?: unknown };
        }> };
        const rings: number[][][] = [];
        geoJson.features?.forEach((feature) => collectRings(feature.geometry?.coordinates, rings));
        const points = rings.flat();
        if (!active || points.length < 3) throw new Error("行政区边界为空");
        setRegionRings(rings);
        boundaryOverlays = rings.map((ring) => new AMap.Polygon({
          path: ring,
          strokeColor: "#087f6d",
          strokeWeight: 1.5,
          strokeOpacity: 0.66,
          fillColor: "#dff3ed",
          fillOpacity: 0.025,
        }));
        boundaryLabels = (geoJson.features ?? []).flatMap((feature) => {
          const name = feature.properties?.name?.trim();
          const position = feature.properties?.centroid ?? feature.properties?.center;
          if (!name || !position || !Number.isFinite(position[0]) || !Number.isFinite(position[1])) return [];
          return [new AMap.Marker({
            position,
            content: `<div class="district-map-label">${escapeHtml(name)}</div>`,
            anchor: "center",
            offset: [0, 0],
            zIndex: 14,
          })];
        });
        map.add([...boundaryOverlays, ...boundaryLabels]);
        const isDistrict = !city.adcode.endsWith("00");
        map.setFitView?.(boundaryOverlays, true, [34, 34, 34, 34], isDistrict ? 13 : 10);
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
      setRegionRings([]);
      controller.abort();
      if (boundaryOverlays.length) map.remove(boundaryOverlays);
      if (boundaryLabels.length) map.remove(boundaryLabels);
    };
  }, [mapState, city.id, city.name, city.adcode, city.center, onRegionBounds]);

  // 图层着色：将逐像素插值结果作为 Canvas 栅格覆盖层，不使用圆形热力核。
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

    const raster = createRasterSurface(grid ?? [], layer, regionRings);
    const rasterLayer = raster ? new AMap.CanvasLayer({
      canvas: raster.canvas,
      bounds: raster.bounds,
      opacity: 0.78,
      zooms: [7, 17],
      zIndex: 6,
    }) : null;
    if (rasterLayer) map.add(rasterLayer);
    return () => {
      map.remove(centerMarker);
      if (rasterLayer) map.remove(rasterLayer);
    };
  }, [mapState, city, layer, pointLabel, grid, regionRings]);

  // 旅游路线：折线 + 编号站点
  useEffect(() => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (mapState !== "ready" || !AMap || !map || !route) return;

    const stops = route.stops.filter((stop): stop is typeof stop & { longitude: number; latitude: number } =>
      stop.longitude != null && stop.latitude != null);
    if (stops.length < 2) return;

    const path = stops.map((stop) => [stop.longitude, stop.latitude]);
    const routeLine = new AMap.Polyline({
      path,
      strokeColor: "#056655",
      strokeWeight: 5,
      strokeOpacity: 0.92,
      lineJoin: "round",
      showDir: true,
      zIndex: 28,
    });
    const overlays: unknown[] = [routeLine];
    let activeInfoWindow: InfoWindowInstance | null = null;
    stops.forEach((stop, index) => {
      const marker = new AMap.Marker({
        position: [stop.longitude, stop.latitude],
        content: `<div class="route-map-marker ${stop.category === "美食" ? "is-food" : ""}" title="${escapeHtml(stop.name)}"><span>${index + 1}</span><b>${escapeHtml(stop.name)}</b></div>`,
        offset: [-13, -13],
        title: stop.name,
        zIndex: 32,
      });
      marker.on("click", () => {
        activeInfoWindow?.close();
        const image = stop.imageUrl ? `<img src="${escapeHtml(stop.imageUrl)}" alt="" />` : "";
        const navigation = stop.links.find((link) => link.kind === "map")?.url;
        const action = navigation ? `<a href="${escapeHtml(navigation)}" target="_blank" rel="noopener noreferrer">打开高德导航</a>` : "";
        activeInfoWindow = new AMap.InfoWindow({
          anchor: "bottom-center",
          offset: [0, -19],
          content: `<article class="route-map-popover">${image}<div><small>${escapeHtml(stop.category)} · ${escapeHtml(stop.time)}</small><strong>${escapeHtml(stop.name)}</strong><p>${escapeHtml(stop.tip)}</p>${action}</div></article>`,
        });
        activeInfoWindow.open(map, [stop.longitude, stop.latitude]);
      });
      overlays.push(marker);
    });
    map.add(overlays);
    map.setFitView?.(overlays, false, [70, 70, 70, 70], 13);
    return () => {
      activeInfoWindow?.close();
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
          <button type="button" className="map-node city-coordinate-node" onClick={() => onPointSelected({ name: `${city.name}中心活动点`, longitude: city.center[0], latitude: city.center[1], adcode: city.adcode })} aria-label={`选择${city.name}中心坐标`}>
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
          ? (route ? "高德地图 · 路线绘制" : "当前实况插值 · 行政区内裁切")
          : mapState === "error" ? "高德地图鉴权待配置" : "城市坐标 · 实时数据"}
      </div>
    </div>
  );
}
