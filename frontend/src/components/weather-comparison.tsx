import type { EnvironmentalForecastPoint } from "@/lib/types";
import type { WeatherChartSpec } from "@/lib/visualization-request";
export interface WeatherComparisonData {spec:WeatherChartSpec;points:EnvironmentalForecastPoint[];missingDates:string[];cityName:string}
const colors=["#286348","#c0883d","#6c76a7","#b05b61","#729c8a","#a589b4","#607c93"];
export function WeatherComparison({data}:{data:WeatherComparisonData}) {
  return <section className="activity-comparison weather-comparison" aria-label="逐小时气温与降雨概率对比"><h3>{data.cityName} · 逐小时环境对比</h3><div className="comparison-legend">{data.spec.dates.map((date,index)=><span key={date}><i style={{background:colors[index]}}/>{date}</span>)}</div>{data.missingDates.length>0&&<p role="status">未取得这些日期的数据：{data.missingDates.join("、")}。图中保留缺失，不使用其他日期替代。</p>}{data.spec.metrics.map(metric=>{
    const values=data.points.map(row=>row[metric]).filter(Number.isFinite);
    const low=metric==="rainProbability"?0:Math.floor(Math.min(...values,0)/5)*5;
    const high=metric==="rainProbability"?100:Math.max(low+5,Math.ceil(Math.max(...values,5)/5)*5);
    const y=(value:number)=>160-(value-low)/(high-low)*140;
    const label=metric==="temperature"?"气温（℃）":"降雨概率（%）";
    return <figure key={metric}><figcaption>{label}</figcaption><svg role="img" aria-label={`${label}，${data.spec.dates.join("与")}逐小时对比`} viewBox="0 0 680 200"><line x1="45" y1="20" x2="45" y2="160" stroke="#b9c7b7"/><line x1="45" y1="160" x2="650" y2="160" stroke="#b9c7b7"/>{[0,.5,1].map(fraction=><g key={fraction}><line x1="45" x2="650" y1={160-fraction*140} y2={160-fraction*140} stroke="#e1e8dd"/><text x="4" y={164-fraction*140} fontSize="12">{low+(high-low)*fraction}</text></g>)}{[0,6,12,18,23].map(hour=><text key={hour} x={45+hour/23*605} y="185" fontSize="12" textAnchor="middle">{hour}:00</text>)}{data.spec.dates.map((date,index)=>{const rows=data.points.filter(row=>row.date===date).sort((a,b)=>a.hour-b.hour);return <g key={date}>{rows.map((row,position)=>{const prior=rows[position-1];return <g key={row.hour}>{prior&&prior.hour===row.hour-1&&<line x1={45+prior.hour/23*605} x2={45+row.hour/23*605} y1={y(prior[metric])} y2={y(row[metric])} stroke={colors[index]} strokeWidth="2"/>}<circle cx={45+row.hour/23*605} cy={y(row[metric])} r="3" fill={colors[index]}><title>{date} {row.hour}:00 · {label} {row[metric]}</title></circle></g>;})}</g>;})}</svg></figure>;
  })}<p>横轴为北京时间小时，纵轴为对应指标。逐小时预报用于环境对比，不是活动评分。</p></section>;
}
