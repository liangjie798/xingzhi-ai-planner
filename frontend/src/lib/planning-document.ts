import type { ActivityInput, DecisionResult, TourismRoute, TourismStop } from "./types";
import { activityAgenda, activityDates, type AgendaItem } from "./activity-agenda";
import { routeDiagram, documentImage } from "./planning-visuals";
import { cityById } from "./cities";

export interface PlanSection { title: string; paragraphs: string[]; stops?: TourismStop[]; diagram?: string; agenda?: AgendaItem[] }
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
      sections.push({ title: `第 ${day} 天 · ${stops[0]?.date ?? route.date}`, paragraphs: [`今天安排 ${stops.length} 个停靠点，按下列顺序衔接景点与餐饮。时间为建议到访时间，开放与预约情况请以官方信息为准。`], stops, diagram: routeDiagram(stops) });
    });
    sections.push({ title: "出行准备与调整", paragraphs: [...route.notes, "出发前一日与出发前两小时复核天气、预约和交通；遇到明显不利的天气，将户外站点换为已核实开放的室内场馆，并预留交通缓冲。", "携带饮水、雨具、充电设备和个人必需用品；团队出行应指定联络人，约定集合与失联处理方式。"] });
  } else if (result) {
    const primaryAgenda = activityAgenda(input, result, result.bestSlot.date || input.date);
    const start = primaryAgenda[2].time.split("–")[0];
    const end = primaryAgenda.at(-1)!.time.split("–")[0];
    sections.push(
      { title: "一、活动目标与结论", paragraphs: [result.recommendation, result.summary, `本次规划面向${input.group}，参与规模 ${input.participants} 人，活动强度为${input.intensity}，单次时长 ${input.duration} 小时。综合适宜度为 ${result.overallScore} 分，等级为“${result.overallLevel}”。`] },
      { title: "二、时间与组织安排", paragraphs: [`活动区域：${city}。执行日期：${result.bestSlot.date || input.date}，建议执行时段：${start}–${end}（遵守用户确认的时段偏好；多日安排见逐日执行表）。`, "活动前 60 分钟，由负责人复查天气与空气质量、场地通道、集合区域及应急物资；活动前 30 分钟完成参与者签到、分组和岗位确认。", `${start} 开始活动。按年龄与项目分批组织，在各阶段安排补水、休息与状态观察；${end} 结束并完成人员确认、场地清理和异常登记。`, "岗位分工建议：设置总协调、签到与秩序、医疗联络、物资补水和环境观察岗位。具体人员与联系方式由组织方在执行前补齐。"] },
      { title: "三、执行措施", paragraphs: result.actions.map((action, index) => `${index + 1}. ${action}。`) },
      { title: "四、风险与备用预案", paragraphs: [result.contingency, "触发调整时，由总协调统一通知各组，先确认人员，再执行转场、减量或延期；记录触发时间、环境数据和处理结果。室内替代场地及转场路线需在执行前核实。"] },
      { title: "五、候选时段比较", paragraphs: [...result.slots].sort((a, b) => b.score - a.score).slice(0, 3).map((slot, i) => `候选 ${i + 1}：${slot.date || input.date} ${slot.label}，适宜度 ${slot.score} 分（${slot.level}），气温 ${slot.temperature}℃、US AQI ${slot.aqi}、降雨概率 ${slot.rainProbability}%。`) },
      { title: "六、筹备检查清单", paragraphs: ["□ 确认负责人、岗位人员及紧急联系人。", "□ 核实场地、疏散通道、转场区域和无障碍需求。", "□ 准备饮水、急救物资、雨具与通讯设备。", "□ 活动前复查环境数据，确认调整与延期条件。", "□ 结束后清点人员、登记异常并复盘。"] },
    );
    activityDates(input).forEach((date, index) => sections.splice(2 + index, 0, { title: `第 ${index + 1} 天 · ${date} 逐时执行安排`, paragraphs: [`以下为建议执行时间表，覆盖到场准备、${input.duration}小时正式活动与离场交接。负责人为建议岗位，执行前请填入具体姓名与联系方式。`, result.slots.some((slot) => (slot.date || input.date) === date) ? "执行表优先遵守对话确认的上午、下午或夜间偏好，在可容纳完整活动的候选小时内比较评分；若全时段最优建议不在偏好时段，以本执行表为准。活动时长超过该时段时需协调跨时段安排，执行前复核天气。" : "该日尚无独立候选时段评分，暂沿用推荐开始时间；需在执行前补查当日逐小时数据后确认。"], agenda: activityAgenda(input, result, date) }));
  }
  const social = route?.socialResearch ?? result?.socialResearch;
  if (social) sections.push({ title: "联网搜索与策划参考", paragraphs: [...social.sources.map((source) => source.platform + "：" + source.detail), ...social.items.map((item) => item.title + "\n" + item.excerpt + "\n来源：" + item.platform + (item.provider ? " · " + item.provider : "") + "\n原文：" + item.url + "\n检索时间：" + item.retrievedAt + (item.publishedAt ? "\n网页标注日期：" + item.publishedAt : "")), social.items.length ? "应用方式：旅游编排会优先核对公开内容提到且已通过 POI 校准的候选地点；其他活动可参考其中组织形式，再依据逐小时环境和参与者情况调整。搜索摘要未验证全文，不等于官方通知或实时热榜；检索时间不等于文章发布时间。" : "本轮未获得有效联网资料，方案依据真实环境数据、已核对地点与场景规则生成。可以在对话中补充公开笔记或视频链接后重新规划。"] });
  sections.push({ title: "数据依据与适用范围", paragraphs: ["天气与空气数据来自 Open-Meteo；空气质量远期缺失小时可能沿用最近可用日相同小时的值，仅供趋势参考。执行前应复核最新预报、当地预警与现场情况。", ...evidence.map((item, i) => `[${i + 1}] ${item.title}｜${item.publisher}\n${item.excerpt}${item.sourceUrl ? `\n原文：${item.sourceUrl}` : ""}`)] });
  return { title: route ? `${city}${route.dayCount}日旅行规划书` : `${city} · ${input.activityType}执行规划书`, subtitle: `${input.date} — ${input.endDate || input.date} · 行知规划`, sections };
}

function stopText(stop: TourismStop) { return [`${stop.time}｜${stop.name}（${stop.category}）`, `推荐理由：${stop.tip}`, ...(stop.address ? [`地址：${stop.address}`] : []), ...stop.links.filter((link) => link.kind === "source").map((link) => `${link.label}：${link.url}`)]; }
export function documentMarkdown(document: PlanningDocument) {
  return `# ${document.title}\n\n${document.subtitle}\n\n` + document.sections.map((section) => `## ${section.title}\n\n${section.paragraphs.join("\n\n")}` + (section.diagram ? `\n\n![行程顺序示意](${section.diagram})` : "") + (section.stops ?? []).map((stop) => `\n\n### ${stop.time} · ${stop.name}\n\n${stop.imageUrl ? `![${stop.name}](${stop.imageUrl})\n\n` : ""}${stopText(stop).slice(1).join("\n\n")}`).join("") + (section.agenda ?? []).map((item) => `\n\n**${item.time} · ${item.title}**\n\n${item.action}\n\n负责岗位：${item.owner}`).join("")).join("\n\n");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadWord(document: PlanningDocument) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, ImageRun } = await import("docx");
  const content = [new Paragraph({ text: document.title, heading: HeadingLevel.TITLE }), new Paragraph(document.subtitle)];
  const paragraph = (text: string) => new Paragraph({ children: text.split("\n").map((line, index) => new TextRun({ text: line, break: index ? 1 : 0 })) });
  const appendImage = async (url: string, title: string, diagram = false) => {
    const data = await documentImage(url);
    if (data) { content.push(new Paragraph({ children: [new ImageRun({ type: "png", data, transformation: { width: 530, height: diagram ? 124 : 300 }, altText: { title, description: title, name: title } })] })); content.push(paragraph(diagram ? "行程顺序示意，非道路导航。" : title + " · 地点资料图片，实际环境以现场为准。")); }
    else if (!diagram) content.push(paragraph("地点照片暂不可用，请通过官方资料核实。"));
  };
  for (const section of document.sections) {
    content.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }), ...section.paragraphs.map(paragraph));
    if (section.diagram) await appendImage(section.diagram, section.title, true);
    // Fetch a day's photographs together to avoid one network timeout per stop.
    const photos = await Promise.all((section.stops ?? []).map(async (stop) => ({ stop, data: stop.imageUrl ? await documentImage(stop.imageUrl) : null })));
    for (const { stop, data } of photos) {
      content.push(new Paragraph({ text: `${stop.time} · ${stop.name}`, heading: HeadingLevel.HEADING_2 }));
      if (data) content.push(new Paragraph({ children: [new ImageRun({ type: "png", data, transformation: { width: 500, height: 290 } })] }), paragraph(stop.name + " · 地点资料图片，实际环境以现场为准。"));
      content.push(...stopText(stop).slice(1).map(paragraph));
    }
    for (const item of section.agenda ?? []) content.push(new Paragraph({ text: item.time + " · " + item.title, heading: HeadingLevel.HEADING_2 }), paragraph(item.action), paragraph("负责岗位：" + item.owner), ...(item.reference ? [paragraph("组织灵感（执行前由负责人确认）：" + item.reference.excerpt + "\n" + item.reference.title + "\n原文：" + item.reference.url)] : []));
  }
  const file = new Document({ creator: "行知", title: document.title, styles: { default: { document: { run: { font: "Microsoft YaHei", size: 22 }, paragraph: { spacing: { after: 180, line: 340 } } } } }, sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: content }] });
  downloadBlob(await Packer.toBlob(file), `${document.title}.docx`);
}
