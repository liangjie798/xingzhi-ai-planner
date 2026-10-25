import type { EvidenceItem, ToolTraceItem, TourismRoute } from "./types";
import { mergePlaceEvidence } from "./place-evidence";

export async function fetchPlaceEvidence(city:string, places:string[]):Promise<{evidence:EvidenceItem[];trace:ToolTraceItem} | null> {
  if (!places.length) return null;
  try {
    const response = await fetch("/planning-evidence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({city,places:places.slice(0,40)}),signal:AbortSignal.timeout(8500)});
    if (response.ok) return await response.json();
  } catch { /* Preserve the existing analysis if evidence lookup fails. */ }
  return null;
}
export async function enrichRouteEvidence(route:TourismRoute):Promise<TourismRoute> {
  const extra = await fetchPlaceEvidence(route.cityName,route.stops.map(stop=>stop.name));
  return extra ? {...route,evidence:mergePlaceEvidence([...extra.evidence,...route.evidence]),trace:[...route.trace.filter(item=>item.id!==extra.trace.id),extra.trace]} : route;
}
