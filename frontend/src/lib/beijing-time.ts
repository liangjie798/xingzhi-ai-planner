/** Shared scheduling floor: Beijing date and time, independent of the host timezone. */
export function beijingTime(now=new Date()) {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const field=(name:string)=>parts.find(part=>part.type===name)!.value;
  return {date:`${field("year")}-${field("month")}-${field("day")}`,minute:Number(field("hour"))*60+Number(field("minute"))};
}
export function executionFloor(date:string,bufferMinutes:number,now=new Date()) {
  const local=beijingTime(now);
  return date<local.date?1440:date===local.date?local.minute+bufferMinutes:0;
}
