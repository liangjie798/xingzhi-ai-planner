import type { AirportCity } from "./airline-types.ts";

// A bounded, explicit airport map. Unknown counties/cities are never guessed by a model.
const entries: Array<[string, string, string[]]> = [
  ["北京", "BJS", ["PEK", "PKX"]], ["上海", "SHA", ["SHA", "PVG"]], ["成都", "CTU", ["TFU", "CTU"]],
  ["广州", "CAN", ["CAN"]], ["深圳", "SZX", ["SZX"]], ["厦门", "XMN", ["XMN"]], ["杭州", "HGH", ["HGH"]],
  ["西安", "SIA", ["XIY"]], ["天津", "TSN", ["TSN"]], ["海口", "HAK", ["HAK"]], ["重庆", "CKG", ["CKG"]],
  ["昆明", "KMG", ["KMG"]], ["济南", "TNA", ["TNA"]], ["南昌", "KHN", ["KHN"]], ["福州", "FOC", ["FOC"]],
  ["武汉", "WUH", ["WUH"]], ["南京", "NKG", ["NKG"]], ["长沙", "CSX", ["CSX"]], ["郑州", "CGO", ["CGO"]],
  ["乌鲁木齐", "URC", ["URC"]], ["哈尔滨", "HRB", ["HRB"]], ["沈阳", "SHE", ["SHE"]], ["大连", "DLC", ["DLC"]],
  ["青岛", "TAO", ["TAO"]], ["长春", "CGQ", ["CGQ"]], ["呼和浩特", "HET", ["HET"]], ["桂林", "KWL", ["KWL"]],
  ["南宁", "NNG", ["NNG"]], ["贵阳", "KWE", ["KWE"]], ["兰州", "LHW", ["LHW"]], ["银川", "INC", ["INC"]],
  ["太原", "TYN", ["TYN"]], ["石家庄", "SJW", ["SJW"]], ["三亚", "SYX", ["SYX"]], ["珠海", "ZUH", ["ZUH"]],
  ["温州", "WNZ", ["WNZ"]], ["宁波", "NGB", ["NGB"]], ["无锡", "WUX", ["WUX"]], ["南通", "NTG", ["NTG"]],
  ["合肥", "HFE", ["HFE"]], ["烟台", "YNT", ["YNT"]], ["拉萨", "LXA", ["LXA"]], ["西宁", "XNN", ["XNN"]],
  ["西双版纳", "JHG", ["JHG"]], ["榆林", "UYN", ["UYN"]], ["锡林浩特", "XIL", ["XIL"]], ["包头", "BAV", ["BAV"]],
];
export const AIRPORT_CITIES: AirportCity[] = entries.map(([name, code, airports]) => ({ name, code, airports, scope: airports.join("/") }));
const specific: Record<string, [string, string]> = {
  北京首都: ["北京", "PEK"], 首都机场: ["北京", "PEK"], 北京大兴: ["北京", "PKX"], 大兴机场: ["北京", "PKX"],
  上海虹桥: ["上海", "SHA"], 上海浦东: ["上海", "PVG"], 成都双流: ["成都", "CTU"], 成都天府: ["成都", "TFU"],
};
export function resolveAirportCity(input: unknown): AirportCity | undefined {
  if (typeof input !== "string") return undefined;
  const name = input.trim().replace(/市$/, "");
  const explicit = specific[name];
  if (explicit) return { name: explicit[0], code: explicit[1], airports: [explicit[1]], scope: name };
  const city = AIRPORT_CITIES.find(city => city.name === name);
  return city ? { ...city, airports: [...city.airports] } : undefined;
}
