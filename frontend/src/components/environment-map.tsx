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

function metricValue(city: CityEnvironment, layer: LayerKey) {
  if (layer === "temperature") return `${city.temperature}°`;
  if (layer === "humidity") return `${city.humidity}%`;
  if (layer === "aqi") return `${city.aqi}`;
  if (layer === "heat") return `${city.heatRisk}`;
  return `${Math.round(Math.max(0, 100 - city.heatRisk * 0.42 - Math.max(0, city.aqi - 35) * 0.21 - city.rainProbability * 0.18))}`;
}

export function EnvironmentMap({ city, layer, onPointSelected }: EnvironmentMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ destroy: () => void } | null>(null);
  const [mapState, setMapState] = useState<"loading" | "ready" | "coordinates" | "error">("loading");
  const amapKey = process.env.NEXT_PUBLIC_AMAP_KEY;
  const securityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;
  const serviceHost = process.env.NEXT_PUBLIC_AMAP_SERVICE_HOST;
  const pointLabel = useMemo(() => metricValue(city, layer), [city, layer]);

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

        const marker = new AMap.Marker({
          position: city.center,
          title: `${city.name} ${layerLabel[layer]} ${pointLabel}`,
          label: { content: `${layerLabel[layer]} ${pointLabel}`, direction: "top" },
        });
        map.add(marker);
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
  }, [amapKey, city, layer, onPointSelected, pointLabel, securityCode, serviceHost]);

  const showFallback = mapState === "coordinates" || mapState === "error";

  return (
    <div className="map-shell">
      <div ref={containerRef} className={`amap-canvas ${showFallback ? "is-hidden" : ""}`} />
      {showFallback && (
        <div className="coordinate-canvas" role="img" aria-label={`${city.name}${layerLabel[layer]}城市坐标视图`}>
          <div className="map-orbit orbit-one" />
          <div className="map-orbit orbit-two" />
          <div className="river-line" />
          <button type="button" className="map-node city-coordinate-node" onClick={() => onPointSelected(`${city.name}中心活动点`)} aria-label={`选择${city.name}中心坐标`}>
            <span className="node-halo" />
            <strong>{pointLabel}</strong>
            <small>{city.name}</small>
          </button>
          <div className="coordinate-label"><MapPin size={14} weight="fill" />{city.center[0].toFixed(4)}, {city.center[1].toFixed(4)}</div>
        </div>
      )}
      {mapState === "loading" && <div className="map-loading" aria-live="polite"><span /><p>正在载入城市空间图层</p></div>}
      <div className="map-mode-badge">
        {mapState === "ready" ? <Crosshair size={14} /> : <WarningCircle size={14} />}
        {mapState === "ready" ? "高德地图 · 城市级数据" : mapState === "error" ? "高德地图鉴权待配置" : "城市坐标 · 实时数据"}
      </div>
    </div>
  );
}
