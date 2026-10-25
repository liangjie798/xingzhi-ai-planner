import type { ActivityInput, ActivityVenue } from "./types";

export const venueProfiles = {
  "研学活动": { keywords: ["历史博物馆", "科技馆", "博物院"], match: /博物馆|博物院|科技馆|科学馆|纪念馆|植物园|自然|生态/, reason: "可围绕展陈或自然观察设计主题任务，将知识讲解、现场记录和成果交流结合起来。", task: "分组观察并完成主题记录，结束前交流发现和整理学习成果。" },
  "校园运动会": { keywords: ["体育场", "田径场"], match: /体育场|田径场|运动场|体育中心/, reason: "场地类型与分组竞赛、检录和项目轮换较匹配，可优先联系核查场地与组织条件。", task: "核查跑道与项目分区，确认检录、补水和人员疏散安排。" },
  "体育课": { keywords: ["体育馆", "运动场"], match: /体育馆|运动场|体育场|体育中心/, reason: "适合进一步核查分组练习和器材条件，便于按课程内容组织示范与轮换。", task: "按课程目标设置练习区，安排示范、分组练习与整理放松。" },
  "社区活动": { keywords: ["文化活动中心", "文化馆", "城市公园"], match: /活动中心|文化馆|文化中心|社区中心|公园/, reason: "可作为交流、分区体验和休闲活动的候选，便于安排集合与休息。", task: "确认可使用区域，设置签到、互动体验与休息点。" },
  "户外训练": { keywords: ["体育场", "运动公园", "训练基地"], match: /体育场|运动场|运动公园|体育公园|训练基地|体育中心/, reason: "场地类型便于核查训练区域与分组动线，可依据训练负荷安排轮换和恢复。", task: "检查地面与训练区域，划定分组边界并设置休息和状态观察点。" },
} as const;
export interface VenueCandidate { id: string; name: string; type: string; address: string; longitude: number; latitude: number }

/** Rank actual POIs, not search advertising. Capacity/opening/accessibility always require confirmation. */
export function recommendActivityVenues(candidates: VenueCandidate[], input: ActivityInput, indoorPreferred = false): ActivityVenue[] {
  const profile = venueProfiles[input.activityType as keyof typeof venueProfiles];
  if (!profile) return [];
  const sensitive = /儿童|老年|敏感/.test(input.group);
  const city = (input.cityName || "").split("·")[0].replace(/(?:市|县|区|特别行政区)$/, "");
  const province = (input.province || "").replace(/(?:省|市|自治区)$/, "");
  return [...new Map(candidates.filter(candidate => profile.match.test(candidate.name + candidate.type)
    && !(input.activityType === "研学活动" && /展厅|展区|大厅/.test(candidate.name) && candidates.some(other => other.name.length > 3 && candidate.name.length > other.name.length && candidate.name.startsWith(other.name)))
    && !/售票|出入口|停车场|公交|地铁|旅行社|公司|销售|用品店|器材店|体育用品|商店|文创店|纪念品|办公室|暂停营业|已关闭|已停业|未开放|未开业|建设中|情绪博物馆|失恋博物馆|自拍/.test(candidate.name)
    && !/购物服务|餐饮服务|住宿服务|交通设施服务/.test(candidate.type)
    && !(input.activityType === "社区活动" && /大学|学院|校区|学校/.test(candidate.name))
    && !(sensitive && /攀岩|漂流|蹦极|登山|山顶|野外生存/.test(candidate.name + candidate.type)))
    .map(candidate => [candidate.id || candidate.name, candidate])).values()]
    .map(candidate => {
      const indoor = /博物馆|博物院|科技馆|科学馆|纪念馆|体育馆|文化馆|文化中心|活动中心/.test(candidate.name);
      const score = (indoorPreferred && indoor ? 8 : 0) + (sensitive && indoor ? 2 : 0) + (profile.match.test(candidate.name) ? 3 : 0)
        + (input.activityType === "研学活动" && /历史|博物院|科技馆|科学馆/.test(candidate.name) ? 6 : 0)
        + (input.activityType === "研学活动" && /科技馆|科学馆/.test(candidate.name) ? 2 : 0)
        + (city && [city+"博物院",city+"博物馆",city+"科技馆"].includes(candidate.name) ? 4 : 0)
        + (province && candidate.name.startsWith(province) ? 3 : 0)
        + (input.activityType === "社区活动" && /文化馆|文化中心/.test(candidate.name) ? 4 : 0);
      return { ...candidate, indoor, score };
    }).sort((a,b) => b.score-a.score).slice(0,3).map(candidate => ({
      id: candidate.id, name: candidate.name, address: candidate.address, longitude: candidate.longitude, latitude: candidate.latitude, indoor: candidate.indoor,
      reason: (input.activityType === "研学活动" ? /科技|科学|航空|航天/.test(candidate.name) ? "可围绕科学现象或技术展项开展探究，适合把原理讲解与现场观察结合。" : /自然|植物|生态/.test(candidate.name) ? "可围绕物种与生态主题开展观察记录，适合自然教育和小组交流。" : "可围绕文物、历史或人物展陈设置研学问题，让学生通过现场观察理解课程内容。" : profile.reason) + (indoorPreferred && candidate.indoor ? "本轮环境提示减少露天停留，优先核查室内区域。" : ""),
      task: (input.activityType === "研学活动" && /科技|科学|航空|航天/.test(candidate.name) ? "选择一项展陈现象，记录观察、提出解释，并分组交流；是否有互动实验需向场馆确认。" : profile.task) + (input.duration >= 4 ? ` ${input.duration}小时活动应拆分任务，穿插用餐、补水和休息。` : ""),
      checks: `${input.participants}人${input.group}需提前核实团体预约、容纳人数、分组批次与${input.duration}小时使用安排。${/老年|敏感/.test(input.group) ? "另核实无台阶路线、休息座椅和卫生间。" : "开放、场地许可及器材条件以管理方确认为准。"}`,
    }));
}
