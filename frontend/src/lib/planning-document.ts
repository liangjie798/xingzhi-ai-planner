import type { ActivityInput, DecisionResult, TourismRoute } from "./types";
import { cityById } from "./cities";

export interface PlanSection { title: string; paragraphs: string[] }
export interface PlanningDocument { title: string; subtitle: string; sections: PlanSection[] }

export function buildPlanningDocument(input: ActivityInput, result: DecisionResult | null, route: TourismRoute | null): PlanningDocument | null {
  if (!result && !route) return null;
  const city = input.cityName || cityById(input.cityId).name;
  const sections: PlanSection[] = [];
  const evidence = route?.evidence ?? result?.evidence ?? [];
  if (route) {
    sections.push({ title: "一、行程目标与安排原则", paragraphs: [route.summary, `本次行程为 ${route.date} 至 ${route.endDate}，共 ${route.dayCount} 天，包含 ${route.stops.length} 个景点与餐饮停靠点。推荐出行时段：${route.bestHours}。`, "下列时间为建议到访时间。出发前核实预约、营业时间与交通；路线连线用于展示站点顺序，实际通行以导航为准。"] });
    [...new Set(route.stops.map((stop) => stop.day))].sort((a, b) => a - b).forEach((day) => {
      const stops = route.stops.filter((stop) => stop.day === day);
      sections.push({ title: `第 ${day} 天 · ${stops[0]?.date ?? route.date}`, paragraphs: stops.flatMap((stop) => [
        `${stop.time}｜${stop.name}（${stop.category}）`, `推荐理由：${stop.tip || (stop.category === "美食" ? "安排本地餐饮停靠，与当日游览节奏衔接。" : "结合当日景点顺序安排到访，兼顾游览与休息。")}`,
        ...(stop.address ? [`地址：${stop.address}`] : []),
        ...stop.links.filter((link) => link.kind === "source").map((link) => `${link.label}：${link.url}`),
      ]) });
    });
    sections.push({ title: "出行准备与调整", paragraphs: [...route.notes, "出发前一日与出发前两小时复核天气、预约和交通；遇到明显不利的天气，将户外站点换为已核实开放的室内场馆，并预留交通缓冲。", "携带饮水、雨具、充电设备和个人必需用品；团队出行应指定联络人，约定集合与失联处理方式。"] });
  } else if (result) {
    const start = `${String(result.bestSlot.hour).padStart(2, "0")}:00`;
    const end = `${String((result.bestSlot.hour + input.duration) % 24).padStart(2, "0")}:00`;
    sections.push(
      { title: "一、活动目标与结论", paragraphs: [result.recommendation, result.summary, `本次规划面向${input.group}，参与规模 ${input.participants} 人，活动强度为${input.intensity}，单次时长 ${input.duration} 小时。综合适宜度为 ${result.overallScore} 分，等级为“${result.overallLevel}”。`] },
      { title: "二、时间与组织安排", paragraphs: [`活动区域：${city}。推荐日期：${result.bestSlot.date || input.date}，推荐时段：${start}–${end}。`, "活动前 60 分钟，由负责人复查天气与空气质量、场地通道、集合区域及应急物资；活动前 30 分钟完成参与者签到、分组和岗位确认。", `${start} 开始活动。按年龄与项目分批组织，在各阶段安排补水、休息与状态观察；${end} 结束并完成人员确认、场地清理和异常登记。`, "岗位分工建议：设置总协调、签到与秩序、医疗联络、物资补水和环境观察岗位。具体人员与联系方式由组织方在执行前补齐。"] },
      { title: "三、执行措施", paragraphs: result.actions.map((action, index) => `${index + 1}. ${action}。`) },
      { title: "四、风险与备用预案", paragraphs: [result.contingency, "触发调整时，由总协调统一通知各组，先确认人员，再执行转场、减量或延期；记录触发时间、环境数据和处理结果。室内替代场地及转场路线需在执行前核实。"] },
      { title: "五、候选时段比较", paragraphs: [...result.slots].sort((a, b) => b.score - a.score).slice(0, 3).map((slot, i) => `候选 ${i + 1}：${slot.date || input.date} ${slot.label}，适宜度 ${slot.score} 分（${slot.level}），气温 ${slot.temperature}℃、US AQI ${slot.aqi}、降雨概率 ${slot.rainProbability}%。`) },
      { title: "六、筹备检查清单", paragraphs: ["□ 确认负责人、岗位人员及紧急联系人。", "□ 核实场地、疏散通道、转场区域和无障碍需求。", "□ 准备饮水、急救物资、雨具与通讯设备。", "□ 活动前复查环境数据，确认调整与延期条件。", "□ 结束后清点人员、登记异常并复盘。"] },
    );
  }
  sections.push({ title: "数据依据与适用范围", paragraphs: ["天气与空气数据来自 Open-Meteo；空气质量远期缺失小时可能沿用最近可用日相同小时的值，仅供趋势参考。执行前应复核最新预报、当地预警与现场情况。", ...evidence.map((item, i) => `[${i + 1}] ${item.title}｜${item.publisher}\n${item.excerpt}${item.sourceUrl ? `\n原文：${item.sourceUrl}` : ""}`)] });
  return { title: route ? `${city}${route.dayCount}日旅行规划书` : `${city} · ${input.activityType}执行规划书`, subtitle: `${input.date} — ${input.endDate || input.date} · 适候规划`, sections };
}

export function documentMarkdown(document: PlanningDocument) {
  return `# ${document.title}\n\n${document.subtitle}\n\n` + document.sections.map((section) => `## ${section.title}\n\n${section.paragraphs.join("\n\n")}`).join("\n\n");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadWord(document: PlanningDocument) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
  const file = new Document({ creator: "适候", title: document.title, styles: { default: { document: { run: { font: "Microsoft YaHei", size: 22 }, paragraph: { spacing: { after: 180, line: 340 } } } } }, sections: [{
    properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    children: [new Paragraph({ text: document.title, heading: HeadingLevel.TITLE }), new Paragraph(document.subtitle),
      ...document.sections.flatMap((section) => [new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }), ...section.paragraphs.map((text) => new Paragraph({ children: text.split("\n").map((line, index) => new TextRun({ text: line, break: index ? 1 : 0 })) }))])],
  }] });
  downloadBlob(await Packer.toBlob(file), `${document.title}.docx`);
}
