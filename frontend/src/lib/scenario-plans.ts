import type { ActivityInput,DecisionResult } from "./types";
export interface ScenarioBlock { title:string; detail:string; deliverable:string }
export function scenarioPlan(input:ActivityInput,result:DecisionResult|null):ScenarioBlock[] {
  const count=input.participants,groups=Math.ceil(count/(input.teamSize || 8));
  const audience=input.audienceDescription || input.group;
  const venues=result?.venues || [];
  const common=`${count}人，${audience}；建议${groups}组，每组最多${input.teamSize || 8}人（组织建议，非接待人数认证）。`;
  if(input.activityType==="研学活动") return [
    {title:"行前：学习目标与分组",detail:`${common} 每组确定记录、提问、汇报与联络岗位。围绕场馆主题提出一个可由现场资料回答的问题；大学生可增加资料对照与独立论证。`,deliverable:"行前问题单与分组岗位表"},
    ...venues.slice(0,3).map(venue=>({title:`现场任务：${venue.name}`,detail:/科技|科学/.test(venue.name) ? "选择一项展品，先写预测，再记录操作现象，比较预测与结果；遵守操作要求，不自行实验。" : /公园|湿地|植物/.test(venue.name) ? "在允许通行区域选择两个观察点，记录环境特征及差异，标注时间与观察方法，不采集或干扰生物。" : "选择三件展品或三处历史线索，记录名称、年代、说明牌证据，比较一处异同；区分现场事实与个人推测。",deliverable:"三条证据记录、一张对照表、一个待核实问题"})),
    {title:"行后：成果与评价",detail:"每组用三分钟回答行前问题，出示记录来源；互评证据完整性、推理与协作，教师复核事实。未完成观察须注明原因。",deliverable:"小组成果页与教师评价表"},
  ];
  if(input.activityType==="体育课") {
    const equipment=input.equipmentCount;
    const stations=equipment ? Math.min(equipment,groups) : null;
    return [{title:"器材与轮换计算",detail:equipment ? `${common} 已确认${equipment}件/套器材，安排${stations}个器材练习站；至少${Math.ceil(groups/stations!)}轮让各组进入器材站。其余组在教师指定区域做徒手练习与观察记录，禁止无人指导等待。` : `${common} 器材数量未知，不能认定可同时开课；请补充“10个篮球”等数量后计算轮换。`,deliverable:equipment ? `${stations}站 × ${Math.ceil(groups/stations!)}轮轮换表` : "器材数量待确认"},
      {title:"教学任务分层",detail:"教师先确认年级与教学目标；基础组练单个动作，进阶组练动作衔接，观察组记录成功次数和常见问题。替代任务由教师依实际能力确认。",deliverable:"分层练习单与动作观察表"},
      {title:"课堂评价",detail:"以动作完成、规则遵守与协作作为记录项，和个人起点比较；记录器材使用、轮换等待与课堂时间，供下次调整。",deliverable:"课堂记录与器材归还清单"}];
  }
  if(input.activityType==="校园运动会") return [
    {title:"报名与分组",detail:`${common} 登记项目、组别与参赛者；姓名重名时使用组织方分配编号。项目名单未录入前，不声称已排除兼项冲突。`,deliverable:"项目报名表与分组检录表"},
    {title:"场地与岗位冲突检查",detail:"在执行管理中为每个项目录入起止时间、场地、裁判和参赛者编号；系统检查同一时段资源重叠。冲突未解决前不确认发布。",deliverable:"含冲突提示的项目排程"},
    {title:"成绩与复核",detail:"指定记录与复核人员，保存项目结果、异常和修订原因。成绩录入后由组织方确认；本系统不代替裁判判定。",deliverable:"成绩记录与复核待办"}];
  if(input.activityType==="社区活动") return [
    {title:"报名与容量",detail:`${common} 先核实场地可接待人数，再开放名额与候补。容量未确认前保留待确认状态。签到与退出分别记录，不能用报名人数代替到场人数。`,deliverable:"报名/候补与签到记录"},
    {title:"分区参与与无障碍核对",detail:"按居民明确表达的需求设置亲子互动、坐席交流或轻量体验区；分别确认通道、座椅、卫生间和休息区，不能仅凭地点类别认定无障碍。",deliverable:"需求分区与现场核对单"},
    {title:"志愿者与反馈",detail:"签到、秩序、物资、联络岗位各指定负责人；记录参与困难与退出原因，复盘时区分居民反馈和组织者判断。",deliverable:"岗位排班与满意度反馈"}];
  if(input.activityType==="户外训练") return [
    {title:"目标与基础确认",detail:`${common} 明确训练目标、既往基础与可接受强度；不依据年龄自动推断体能。先核对路线通行与活动组织条件。`,deliverable:"训练目标与参与条件确认表"},
    {title:"分段路线与补给",detail:"路线距离、爬升、路面与撤离点暂无可靠实地数据时列为待确认，不能把城市POI连线当作可通行训练路线；按已确认分段设置集合、休息与联络。",deliverable:"待核实路线卡、装备及补给表"},
    {title:"环境变化与退出",detail:"出发前与关键节点复核预报和官方通知；由负责人决定转为室内、降低负荷、返程或延期。记录调整条件与全员确认，不以AI评分代替现场决策。",deliverable:"替代方案与退出交接记录"}];
  return [{title:"旅行可行性",detail:"路线按完整游览、餐饮窗口、交通与休息计算；未核实的营业时间和价格列为待确认，交通估算不能当作实时导航。",deliverable:"逐站时间表、费用清单与待确认项"}];
}
export interface ExecutionEvent { planKey?:string; id:string; date:string; start:string; end:string; title:string; venue:string; owner:string; people:string; done?:boolean; result?:string }
export function resourceConflicts(events:ExecutionEvent[]):string[] {
  const errors:string[]=[];
  const tokens=(value:string)=>value.split(/[、,，;；\n]/).map(v=>v.trim()).filter(Boolean);
  for(let i=0;i<events.length;i++) {
    const a=events[i];
    if(!a.date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.end)||a.start>=a.end){errors.push(`${a.title}：日期或起止时间无效`);continue;}
    for(let j=i+1;j<events.length;j++) {
      const b=events[j];if(a.date!==b.date||a.start>=b.end||b.start>=a.end)continue;
      const resources=[...tokens(a.owner).filter(v=>tokens(b.owner).includes(v)).map(v=>`负责人${v}`),...tokens(a.people).filter(v=>tokens(b.people).includes(v)).map(v=>`参与者${v}`),...(a.venue&&a.venue===b.venue?[`场地${a.venue}`]:[])];
      if(resources.length)errors.push(`${a.title}与${b.title}时间重叠：${resources.join("、")}`);
    }
  }
  return errors;
}
export interface CostItem {id:string;label:string;quantity:number;unitPrice:number;status:"估算"|"已确认"}
export function budgetSummary(items:CostItem[],participants:number,limit?:number) {
  const total=items.reduce((sum,item)=>sum+Math.max(0,item.quantity)*Math.max(0,item.unitPrice),0);
  return {total:Math.round(total*100)/100,perPerson:Math.round(total/Math.max(1,participants)*100)/100,overBudget:limit!==undefined&&total>limit*participants,unconfirmed:items.filter(item=>item.status!=="已确认").length};
}
