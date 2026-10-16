"use client";

/// <reference types="@amap/amap-jsapi-types" />

import { Crosshair, MapPin, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CityEnvironment, LayerKey } from "@/lib/types";

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode?: string; serviceHost?: string };
  }
}

interface EnvironmentMapProps {
  city: CityEnvironment;
  layer: LayerKey;
  onPointSelected: (name: string) => void;
}

const layerLabel: Record<LayerKey, string> = {
  comfort: "活动适宜度",
  temperature: "实时气温",
  humidity: "相对湿度",
  aqi: "空气质量",
  heat: "热风险",
};

const fallbackPoints = [
  { x: 21, y: 25, label: "西部片区", delta: -6 },
  { x: 62, y: 20, label: "北部片区", delta: 3 },
  { x: 72, y: 55, label: "东部片区", delta: 8 },
  { x: 35, y: 67, label: "南部片区", delta: 5 },
  { x: 52, y: 43, label: "中心城区", delta: 0 },
  { x: 16, y: 78, label: "近郊片区", delta: -3 },
];

function metricValue(city: CityEnvironment, layer: LayerKey, delta = 0) {
  if (layer === "temperature") return `${Math.round(city.temperature + delta * 0.18)}°`;
  if (layer === "humidity") return `${Math.round(city.humidity + delta * 0.4)}%`;
  if (layer === "aqi") return `${Math.max(18, city.aqi + delta)}`;
  if (layer === "heat") return `${Math.max(10, city.heatRisk + delta)}`;
  return `${Math.round(Math.max(32, 82 - city.heatRisk / 2 - Math.max(0, city.aqi - 50) / 3 + delta))}`;
}

export function EnvironmentMap({ city, layer, onPointSelected }: EnvironmentMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ destroy: () => void } | null>(null);
  const [mapState, setMapState] = useState<"loading" | "ready" | "demo" | "error">("loading");
  const amapKey = process.env.NEXT_PUBLIC_AMAP_KEY;
  const securityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;
  const serviceHost = process.env.NEXT_PUBLIC_AMAP_SERVICE_HOST;
  const seed = useMemo(() => city.name.charCodeAt(0) % 7, [city.name]);

  useEffect(() => {
    if (!amapKey || !containerRef.current) {
      setMapState("demo");
      return;
    }

    window._AMapSecurityConfig = serviceHost ? { serviceHost } : { securityJsCode: securityCode };
    let cancelled = false;
    setMapState("loading");

    import("@amap/amap-jsapi-loader").then(({ default: AMapLoader }) => AMapLoader.load({
      key: amapKey,
      version: "2.0",
      plugins: ["AMap.Scale", "AMap.ToolBar", "AMap.Geocoder"],
    }))
      .then((AMap) => {
        AMap.getConfig().appname = "amap-jsapi-skill";
        if (cancelled || !containerRef.current) return;
        const map = new AMap.Map(containerRef.current, {
          viewMode: "3D",
          zoom: 11.2,
          pitch: 36,
          center: city.center,
          mapStyle: "amap://styles/whitesmoke",
          showLabel: true,
        });
        map.addControl(new AMap.Scale({ position: "LB" }));
        map.addControl(new AMap.ToolBar({ position: "RB", liteStyle: true }));

        const offsets = [[-0.12, -0.04], [0.08, -0.08], [0.13, 0.04], [-0.08, 0.08], [0.02, 0.02], [-0.16, 0.1]];
        const circles = offsets.map(([lngOffset, latOffset], index) => {
          const value = Number(metricValue(city, layer, fallbackPoints[index].delta).replace(/[^0-9.-]/g, ""));
          const danger = layer === "aqi" ? value > 100 : layer === "heat" ? value > 70 : false;
          return new AMap.CircleMarker({
            center: [city.center[0] + lngOffset, city.center[1] + latOffset],
            radius: 16 + Math.abs(fallbackPoints[index].delta),
            strokeColor: danger ? "#d85c4a" : "#087f6d",
            strokeWeight: 1,
            strokeOpacity: 0.65,
            fillColor: danger ? "#f07460" : "#13a58e",
            fillOpacity: 0.22 + index * 0.04,
            cursor: "pointer",
            zIndex: 10 + index,
          });
        });
        map.add(circles);
        map.on("click", (event: { lnglat: { getLng: () => number; getLat: () => number } }) => {
          const point = event.lnglat;
          new AMap.Marker({ position: point, map });
          onPointSelected(`地图选点 ${point.getLng().toFixed(4)}, ${point.getLat().toFixed(4)}`);
        });
        mapRef.current = map;
        setMapState("ready");
      })
      .catch(() => setMapState("error"));

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [amapKey, city, layer, onPointSelected, securityCode, serviceHost]);

  const showFallback = mapState === "demo" || mapState === "error";

  return (
    <div className="map-shell">
      <div ref={containerRef} className={`amap-canvas ${showFallback ? "is-hidden" : ""}`} />
      {showFallback && (
        <div className="spatial-demo" role="img" aria-label={`${city.name}${layerLabel[layer]}演示空间图层`}>
          <div className="map-orbit orbit-one" />
          <div className="map-orbit orbit-two" />
          <div className="river-line" />
          {fallbackPoints.map((point, index) => (
            <button
              type="button"
              className={`map-node node-${index + 1}`}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              key={point.label}
              onClick={() => onPointSelected(`${city.name}${point.label}活动点`)}
              aria-label={`选择${point.label}`}
            >
              <span className="node-halo" style={{ animationDelay: `${index * 180 + seed * 40}ms` }} />
              <strong>{metricValue(city, layer, point.delta)}</strong>
              <small>{point.label}</small>
            </button>
          ))}
          <div className="demo-map-label"><MapPin size={14} weight="fill" />{city.name} · {layerLabel[layer]}</div>
        </div>
      )}
      {mapState === "loading" && <div className="map-loading" aria-live="polite"><span /><p>正在载入城市空间图层</p></div>}
      <div className="map-mode-badge">
        {mapState === "ready" ? <Crosshair size={14} /> : <WarningCircle size={14} />}
        {mapState === "ready" ? "高德实时底图" : "演示空间图层"}
      </div>
    </div>
  );
}
