/** Reviewed product knowledge. Keep volatile prices, opening hours and forecasts out. */
export const knowledgeBase = [
  { id: "forecast", title: "天气与预报", match: /天气预报|预报.*准确|降水概率|降雨概率/, text: "预报会随观测和模型更新而变化，出发前应再次核对。降水概率是预报概率，不等于下雨持续时间或降水量。查询具体天气只需城市和日期，不需要活动人数。", source: "https://open-meteo.com/en/docs" },
  { id: "air", title: "空气质量指标", match: /AQI|PM2[.．]?5|空气质量.*(?:是什么|区别)|美标|国标/i, text: "AQI是空气质量指数，用于把污染物浓度转换成便于比较的空气污染水平指标。本站展示 US AQI。不同空气质量指数体系的阈值不同，比较数据时要先核对标准、时间和地点。PM2.5 是细颗粒物浓度，不能直接当作 AQI 分数。", source: "https://open-meteo.com/en/docs/air-quality-api" },
  { id: "trip", title: "旅行安排与预约", match: /预约|门票|闭馆|营业时间|开放时间/, text: "景点门票、预约与开放时间可能变化，应以场馆或景区官方公布的信息为准。规划中的站点时间是建议安排，不代表已预约或已购票。无法核验实时信息时会明确提示。" },
  { id: "food", title: "餐饮与预算", match: /美食|餐饮|过敏|预算|费用|花费/, text: "可在规划中说明人均预算、饮食禁忌、过敏原和偏好。餐饮安排应与游览区域衔接，并留出排队和休息时间。未核实的菜单价格、消费评价和热度不能作为事实。" },
  { id: "event", title: "活动组织", match: /运动会.*(?:准备|物资)|筹备|人员分工|应急预案|活动组织/, text: "活动执行方案应列出准备、签到、开展、补水休息、结束清场等环节，同时明确负责人、物资、人员规模和天气变化时的调整办法。校园和社区活动还需按主办方要求确认场地与保障条件。" },
  { id: "access", title: "同行需求与无障碍", match: /无障碍|老人|老年|亲子|轮椅|儿童/, text: "请说明同行者的年龄、行动能力、步行时长和休息需求。规划可降低强度、增加休息、减少跨区域移动；无障碍设施和通行条件仍需向场馆核实。" },
  { id: "transport", title: "交通与路线衔接", match: /交通|地铁|公交|打车|自驾|停车|换乘/, text: "优先按地理片区安排相邻站点，交通时间需计入行程，并预留换乘、步行和排队余量。地图连线仅表示游览顺序，不是实际道路导航；班次、末班车、停车和道路管制需以官方实时信息为准。" },
  { id: "lodging", title: "住宿选择", match: /住宿|酒店|民宿|住哪里|住哪儿/, text: "选择住宿时可比较预算、通勤距离、公共交通、退改政策和入住条件。先确认真实地址，再检查与每日路线的衔接；本平台不会替你预订，也不能保证实时房价、余房或入住资格。" },
  { id: "packing", title: "出行装备", match: /带什么|装备|穿什么|穿衣|行李|防晒|雨具/, text: "装备应结合目的地预报、活动时长和个人需求选择，通常包括合脚鞋、饮用水、必要证件、充电设备及适合天气的衣物与雨具。特殊活动的装备要求应由主办方或专业人员确认。" },
  { id: "rain", title: "雨天与天气变化", match: /雨天|下雨.*(?:怎么办|安排)|天气变化|备选|替代方案/, text: "雨天可减少室外步行，改为相近区域的室内场馆，并提前核查预约和开放情况。遇官方预警或主办方停办通知，应按通知调整；行程建议不能替代气象预警和现场指挥。" },
  { id: "study", title: "研学与校园安排", match: /研学|体育课|校园.*(?:组织|安排|注意)/, text: "研学可按学习目标、行前导入、现场任务、休息与成果分享组织。校园活动应明确带队人员、分组、签到清点、场地边界和家校沟通方式；具体人数与保障要求由学校核定。" },
  { id: "community", title: "社区与户外活动", match: /社区|团建|训练.*(?:组织|准备)/, text: "活动应明确服务对象、场地、负责人、参与方式、时间表和退出机制。户外活动应与参与者能力相匹配，保留休息与调整空间，并事先确认场地使用与相关管理要求。" },
  { id: "boundaries", title: "回答范围与不确定性", match: /不能回答|无法回答|准确吗|可信|局限|能力范围/, text: "可以询问天气、旅行、活动组织、环境指标和平台使用，也可以尝试其他知识问题。超出知识库时会尝试联网检索；没有可靠资料时会说明无法确认。实时价格、预警、预约状态和个体专业判断不能凭模型记忆保证准确。" },
  { id: "sources", title: "资料与推荐依据", match: /数据来源|来源|出处|数据.*哪|从哪.*数据|推荐.*哪|哪里来|哪来的|知识库|推荐依据|小红书|抖音|热榜/, text: "天气预报来自 Open-Meteo，高德用于解析城市和行政区域位置，再按对应坐标查询逐小时预报。地点推荐结合高德按城市限定的地点检索与人群筛选规则；实时地点不可用时会标明使用内置候选，不能当作场馆适宜性认证。空气质量展示 US AQI 预报；这些是预报数据，不是你所在位置的现场实测。每次天气回答下方附来源链接、查询日期和获取时间。其他联网资料保留原文链接；搜索摘要不等于平台热榜，也不保证已核验全文。查询失败或资料缺失时会明确说明。", source: "https://open-meteo.com/en/docs" },
  { id: "product", title: "行知使用说明", match: /你能做什么|怎么使用|如何使用|下载|导出|行知是什么|你是谁/, text: "行知支持城市天气查询、旅行与活动规划、推荐依据解释、候选时段比较和筹备清单。规划条件可以在对话中逐步补齐，结果在环境地图与执行方案页查看，规划文档可下载。登录用户的对话记忆与账户绑定，可清除。管理员在独立管理平台管理普通用户、处理反馈及查看统计。" },
] as const;

export type ConversationIntent = "weather" | "planning" | "knowledge";
const sourceQuestion = /来源|出处|依据|从哪|哪里来|哪来的|真实吗|可靠吗|可信|准确吗/;
export function classifyConversation(message: string, hasPendingPlan = false): ConversationIntent {
  if (/(?:什么是|是什么|何为|含义|定义|区别|解释|科普)/.test(message) && /AQI|PM2[.．]?5|空气质量|降雨概率|降水概率|湿度/i.test(message)) return "knowledge";
  if (/比较.*候选时段|规划活动并比较/.test(message)) return "planning";
  if (/适合.*(?:去|地方|城市)|推荐.*(?:景点|地方|城市)|(?:亲子|老人|学生|轮椅).*(?:去哪|哪里|怎么玩)/.test(message)) return "knowledge";
  if (/介绍|城市简介|城市概况/.test(message) && !/帮我规划|制定|生成.*方案/.test(message)) return "knowledge";
  if (sourceQuestion.test(message)) return "knowledge";
  if (/^(你好|您好|嗨|谢谢|感谢|hello|hi)[！!。\s]*$/i.test(message)) return "knowledge";
  const planning = /规划|策划|安排.*(?:路线|行程|活动)|举办|组织.*活动|运动会|体育课|研学|户外训练|社区活动|旅游|旅行|去.+玩|玩[一二两三四五六七\d]+天/;
  const question = /[?？]|什么|怎么|如何|为什么|是否|能不能|多少|告诉我|介绍|解释|区别|推荐.*(?:美食|景点)/;
  if (/天气|气温|温度|降雨|下雨|湿度|空气质量|AQI|PM2[.．]?5/i.test(message) && !planning.test(message)
    && !/是什么|为什么|区别|预报.*准确|概率.*意思|美标|国标/.test(message)) return "weather";
  if ((planning.test(message) || /(?:旅游|旅行).*(?:路线|行程)|[一二两三四五六七\d]+天.*游/.test(message)) && !/怎么|如何|为什么|准备什么|需要什么|注意什么|是什么|有什么|区别/.test(message)) return "planning";
  if (question.test(message) || knowledgeBase.some((item) => item.match.test(message))) return "knowledge";
  return hasPendingPlan ? "planning" : "knowledge";
}

/** Only accept explicit date/place continuations, never arbitrary short nouns. */
export function isWeatherFollowup(message: string, lastAssistant: string): boolean {
  if (!/天气预报（北京时间）|你想查询哪个城市|可靠天气数据|可靠天气。/.test(lastAssistant)) return false;
  if (sourceQuestion.test(message) || retrieveKnowledge(message).length || /什么|怎么|如何|为什么|学生|强度|预算|人数|规划|旅游/.test(message)) return false;
  const text = message.trim().replace(/^(?:那么|那|改成|换成)/, "").replace(/(?:的呢|呢)?[?？。！!]?$/, "");
  if (/^(?:20\d{2}[-/年])?\d{1,2}[-/月]\d{1,2}[日号]?$/.test(text)) return true;
  if (/^(?:(?:本月|这个月|下个月|下月)?[零〇一二两三四五六七八九十\d]+[日号]|(?:今年|明年)?[零〇一二两三四五六七八九十\d]+月[零〇一二两三四五六七八九十\d]+[日号]?)$/.test(text)) return true;
  if (/^(?:(?:今天|明天|后天|大后天|下周)(?:上午|下午|晚上)?|(?:再过|过|往后)?[一二两三四五六七八九十\d]+(?:天|个?(?:星期|周))(?:以|之)?后|(?:再过|过)[一二两三四五六七八九十\d]+天)(?:上午|下午|晚上)?$/.test(text)) return true;
  if (!/你想查询哪个城市/.test(lastAssistant) && !/^(?:那么|那|改成|换成)|呢[?？。！!]*$/.test(message.trim())) return false;
  if (/^[\u4e00-\u9fa5]{2,12}(?:市|区|县|特别行政区)$/.test(text)) return true;
  if (/^(?:北京|上海|广州|深圳|杭州|成都|武汉|南京|西安|香港|澳门|重庆|天津|太原|青岛|天水)$/.test(text)) return true;
  // A bare city can answer an explicit location question, but not follow a forecast.
  return /你想查询哪个城市/.test(lastAssistant) && /^[\u4e00-\u9fa5]{2,6}$/.test(text) && !/数据|来源|解释|谢谢|你好/.test(text);
}

export function retrieveKnowledge(message: string) {
  return knowledgeBase.filter((item) => item.match.test(message)).slice(0, 3);
}
