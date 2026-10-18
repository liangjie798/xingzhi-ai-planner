"use client";

import type { CitySearchResult } from "./types";

export interface ResolvedAddress {
  name: string;
  longitude: number;
  latitude: number;
  province: string;
  city: string;
  district: string;
  adcode: string;
}

async function gateway<T>(params: URLSearchParams): Promise<T> {
  const response = await fetch(`/location-gateway?${params.toString()}`, { cache: "no-store" });
  const body = await response.json() as T & { detail?: string };
  if (!response.ok) throw new Error(body.detail || `位置服务返回 ${response.status}`);
  return body;
}

export function searchChinaDistricts(query: string) {
  return gateway<CitySearchResult[]>(new URLSearchParams({ action: "search", q: query }));
}

export function geocodeActivityAddress(address: string, city: string) {
  return gateway<ResolvedAddress>(new URLSearchParams({ action: "geocode", address, city }));
}

export function reverseGeocode(longitude: number, latitude: number) {
  return gateway<ResolvedAddress>(new URLSearchParams({
    action: "reverse",
    longitude: String(longitude),
    latitude: String(latitude),
  }));
}
