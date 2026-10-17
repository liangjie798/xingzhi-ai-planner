export interface CityOption {
  id: string;
  name: string;
  province: string;
  adcode: string;
  center: [number, number];
}

export const cities: CityOption[] = [
  { id: "beijing", name: "北京市", province: "北京市", adcode: "110000", center: [116.397428, 39.90923] },
  { id: "shanghai", name: "上海市", province: "上海市", adcode: "310000", center: [121.473701, 31.230416] },
  { id: "guangzhou", name: "广州市", province: "广东省", adcode: "440100", center: [113.264385, 23.129112] },
  { id: "shenzhen", name: "深圳市", province: "广东省", adcode: "440300", center: [114.057868, 22.543099] },
  { id: "hangzhou", name: "杭州市", province: "浙江省", adcode: "330100", center: [120.15507, 30.274085] },
  { id: "chengdu", name: "成都市", province: "四川省", adcode: "510100", center: [104.066541, 30.572269] },
  { id: "wuhan", name: "武汉市", province: "湖北省", adcode: "420100", center: [114.305393, 30.593099] },
  { id: "nanjing", name: "南京市", province: "江苏省", adcode: "320100", center: [118.796877, 32.060255] },
  { id: "xian", name: "西安市", province: "陕西省", adcode: "610100", center: [108.93977, 34.341574] },
];

export const cityById = (id: string) => cities.find((city) => city.id === id) ?? cities[4];
