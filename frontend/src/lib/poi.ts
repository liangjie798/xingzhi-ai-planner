export interface PoiSpot {
  name: string;
  longitude: number;
  latitude: number;
  tag: string;
  blurb: string;
}

/**
 * 各城市热门景点候选库（坐标为高德坐标系 GCJ-02）。
 * 公开景点候选库，供 AI 排程与地图绘制使用，不代表实时平台热度排名。
 */
export const CITY_POIS: Record<string, PoiSpot[]> = {
  北京市: [
    { name: "故宫博物院", longitude: 116.397, latitude: 39.918, tag: "经典必去", blurb: "明清皇家宫殿，中轴线上的人气顶流。" },
    { name: "颐和园", longitude: 116.275, latitude: 39.999, tag: "皇家园林", blurb: "昆明湖畔步道舒适，适合慢节奏游览。" },
    { name: "南锣鼓巷", longitude: 116.403, latitude: 39.941, tag: "热门街区", blurb: "胡同文创与小食聚集地，出片率高。" },
    { name: "天坛公园", longitude: 116.41, latitude: 39.882, tag: "经典必去", blurb: "祈年殿打卡机位多，园内晨练氛围好。" },
    { name: "什刹海", longitude: 116.383, latitude: 39.94, tag: "夜景推荐", blurb: "环湖酒吧街与胡同夜景，傍晚最佳。" },
    { name: "奥林匹克森林公园", longitude: 116.393, latitude: 40.012, tag: "亲子友好", blurb: "城市绿肺，开阔草坪适合家庭活动。" },
  ],
  上海市: [
    { name: "外滩", longitude: 121.49, latitude: 31.238, tag: "经典必去", blurb: "万国建筑博览带，对望陆家嘴天际线。" },
    { name: "豫园", longitude: 121.492, latitude: 31.227, tag: "江南园林", blurb: "九曲桥与城隍庙商圈一体游览。" },
    { name: "武康路", longitude: 121.437, latitude: 31.208, tag: "热门街区", blurb: "梧桐区 Citywalk 路线的核心段。" },
    { name: "陆家嘴", longitude: 121.501, latitude: 31.239, tag: "城市打卡", blurb: "三件套观景台，夜景灯光极佳。" },
    { name: "田子坊", longitude: 121.469, latitude: 31.21, tag: "文创街区", blurb: "石库门弄堂里的小店与手作。" },
    { name: "上海迪士尼度假区", longitude: 121.657, latitude: 31.143, tag: "亲子友好", blurb: "全天候主题乐园，建议预留一整天。" },
  ],
  广州市: [
    { name: "广州塔", longitude: 113.319, latitude: 23.106, tag: "城市打卡", blurb: "小蛮腰夜景与珠江新城灯光带。" },
    { name: "沙面岛", longitude: 113.244, latitude: 23.109, tag: "热门街区", blurb: "欧陆建筑群，街拍氛围浓厚。" },
    { name: "陈家祠", longitude: 113.246, latitude: 23.125, tag: "岭南文化", blurb: "广府砖雕木雕艺术巅峰之作。" },
    { name: "白云山", longitude: 113.299, latitude: 23.184, tag: "户外徒步", blurb: "市区绿肺，摩星岭可俯瞰全城。" },
    { name: "上下九步行街", longitude: 113.244, latitude: 23.115, tag: "美食街区", blurb: "老西关小吃集中地。" },
    { name: "珠江夜游（天字码头）", longitude: 113.271, latitude: 23.109, tag: "夜景推荐", blurb: "夜游珠江看两岸灯光秀。" },
  ],
  深圳市: [
    { name: "大梅沙海滨公园", longitude: 114.307, latitude: 22.594, tag: "海滨度假", blurb: "免费沙滩，适合亲海休闲。" },
    { name: "世界之窗", longitude: 113.972, latitude: 22.535, tag: "经典必去", blurb: "环球微缩景观，夜场烟花常驻。" },
    { name: "莲花山公园", longitude: 114.056, latitude: 22.56, tag: "亲子友好", blurb: "山顶广场视野开阔，风筝草坪出片。" },
    { name: "甘坑古镇", longitude: 114.124, latitude: 22.66, tag: "热门街区", blurb: "客家古镇夜景与汉服打卡。" },
    { name: "深圳湾公园", longitude: 113.947, latitude: 22.517, tag: "海滨骑行", blurb: "滨海栈道骑行观候鸟。" },
    { name: "东门老街", longitude: 114.119, latitude: 22.546, tag: "美食街区", blurb: "老深圳商业街，小吃密集。" },
  ],
  杭州市: [
    { name: "西湖·断桥残雪", longitude: 120.15, latitude: 30.259, tag: "经典必去", blurb: "白堤起点，环湖核心机位。" },
    { name: "灵隐寺·飞来峰", longitude: 120.097, latitude: 30.241, tag: "人文古刹", blurb: "千年名刹，石窟造像值得一逛。" },
    { name: "西溪国家湿地公园", longitude: 120.062, latitude: 30.273, tag: "热门街区", blurb: "摇橹船穿行水网，避开人流。" },
    { name: "清河坊历史街区", longitude: 120.167, latitude: 30.244, tag: "美食街区", blurb: "南宋御街旁的老字号与小食。" },
    { name: "拱宸桥·桥西历史街区", longitude: 120.142, latitude: 30.327, tag: "运河夜景", blurb: "京杭大运河夜游起点。" },
    { name: "太子湾公园", longitude: 120.138, latitude: 30.235, tag: "赏花胜地", blurb: "郁金香与樱花季顶流。" },
  ],
  成都市: [
    { name: "宽窄巷子", longitude: 104.053, latitude: 30.665, tag: "城市打卡", blurb: "清代街巷格局，茶馆文化浓缩地。" },
    { name: "大熊猫繁育研究基地", longitude: 104.147, latitude: 30.733, tag: "亲子友好", blurb: "建议早上去，看熊猫最活跃时段。" },
    { name: "武侯祠·锦里", longitude: 104.048, latitude: 30.644, tag: "三国文化", blurb: "祠庙连着夜景美食街。" },
    { name: "都江堰景区", longitude: 103.619, latitude: 31.005, tag: "经典必去", blurb: "两千年水利工程，可与青城山联游。" },
    { name: "人民公园·鹤鸣茶社", longitude: 104.055, latitude: 30.662, tag: "本地生活", blurb: "盖碗茶与采耳，感受慢成都。" },
    { name: "春熙路·太古里", longitude: 104.081, latitude: 30.66, tag: "潮流商圈", blurb: "裸眼 3D 大屏与潮流首店。" },
  ],
  武汉市: [
    { name: "黄鹤楼", longitude: 114.305, latitude: 30.543, tag: "经典必去", blurb: "城市地标，夜间有灯光演艺。" },
    { name: "东湖绿道", longitude: 114.393, latitude: 30.551, tag: "户外骑行", blurb: "湖中绿道骑行，落雁景区出片。" },
    { name: "户部巷", longitude: 114.306, latitude: 30.545, tag: "美食街区", blurb: "过早文化集中地，热干面豆皮。" },
    { name: "昙华林", longitude: 114.312, latitude: 30.549, tag: "热门街区", blurb: "近代历史街区，文创小店密集。" },
    { name: "江汉路步行街", longitude: 114.288, latitude: 30.58, tag: "潮流商圈", blurb: "百年商业街， 夜间灯光氛围好。" },
    { name: "湖北省博物馆", longitude: 114.363, latitude: 30.565, tag: "人文场馆", blurb: "越王勾践剑与曾侯乙编钟。" },
  ],
  南京市: [
    { name: "中山陵", longitude: 118.847, latitude: 32.065, tag: "经典必去", blurb: "钟山风景区核心，需提前预约。" },
    { name: "夫子庙·秦淮河", longitude: 118.789, latitude: 32.021, tag: "夜景推荐", blurb: "画舫夜游秦淮，灯火最盛。" },
    { name: "玄武湖公园", longitude: 118.794, latitude: 32.076, tag: "亲子友好", blurb: "城中之湖，环湖步道舒适。" },
    { name: "总统府", longitude: 118.795, latitude: 32.045, tag: "近代史迹", blurb: "中国近代史遗址博物馆。" },
    { name: "鸡鸣寺·明城墙", longitude: 118.799, latitude: 32.061, tag: "赏樱胜地", blurb: "樱花季隧道级机位。" },
    { name: "老门东", longitude: 118.793, latitude: 32.013, tag: "热门街区", blurb: "明清街巷改造，小吃与文创。" },
  ],
  西安市: [
    { name: "秦始皇兵马俑博物馆", longitude: 109.278, latitude: 34.384, tag: "经典必去", blurb: "世界第八大奇迹，建议早出发。" },
    { name: "大雁塔·大慈恩寺", longitude: 108.964, latitude: 34.219, tag: "人文古刹", blurb: "玄奘译经之地，北广场音乐喷泉。" },
    { name: "回民街·鼓楼", longitude: 108.939, latitude: 34.265, tag: "美食街区", blurb: "泡馍、烤肉、甑糕集中地。" },
    { name: "西安城墙·永宁门", longitude: 108.94, latitude: 34.252, tag: "城市打卡", blurb: "城墙上骑行，日落时段最出片。" },
    { name: "大唐不夜城", longitude: 108.964, latitude: 34.215, tag: "夜景推荐", blurb: "盛唐主题灯光街演，夜游顶流。" },
    { name: "陕西历史博物馆", longitude: 108.953, latitude: 34.225, tag: "人文场馆", blurb: "何家村窖藏与唐代壁画，需预约。" },
  ],
};

export function poisForCity(cityName: string): PoiSpot[] {
  const clean = cityName.replace(/市$/, "");
  if (CITY_POIS[cityName]) return CITY_POIS[cityName];
  for (const [key, value] of Object.entries(CITY_POIS)) {
    if (key.replace(/市$/, "") === clean) return value;
  }
  return [];
}

export const DEFAULT_STOP_TIMES = ["09:00", "11:00", "14:00", "16:00", "18:30", "20:00"];

