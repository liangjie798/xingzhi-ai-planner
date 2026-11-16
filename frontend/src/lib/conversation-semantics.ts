/** Remove explicitly rejected clauses before extracting new planning values. */
export function affirmativePlanningText(text: string): string {
  return text.split(/[，,；;。\n]/).filter(clause => !/(?:不是|不去|不玩|不要|不用|别再|先别)/.test(clause) || /不想太累/.test(clause)).join('，');
}

/** Split independent assignments without splitting quoted literal values. */
export function memoryAssignments(text: string): string[] {
  const pairs: Record<string,string> = {'“':'”','「':'」','『':'』','"':'"',"'":"'"};
  let end='',part='';const parts:string[]=[];
  for(const char of text){
    if(end){part+=char;if(char===end)end='';}
    else if(pairs[char]){end=pairs[char];part+=char;}
    else if(/[，,；;]/.test(char)){parts.push(part.trim());part='';}
    else part+=char;
  }
  parts.push(part.trim());
  return parts.length>1 && parts.every(p=>/^.{1,60}?(?:是|为|[:：=]).+/.test(p)) ? parts : [text];
}

export const confirmationOnly = (text:string) => /(?:先|暂时)?(?:不要|别|不用|不必)(?:立即|马上|再)?(?:生成|规划|查询|查|改|修改)|只(?:确认|复述|核对)|先别生成/.test(text);
export const indoorAlternative = (text:string) => /室内|下雨/.test(text) && /替代|备选|怎么办|方案/.test(text);
export const casualGreeting = (text:string) => /^(?:你好|您好|嗨|hello|hi)/i.test(text) && /聊|心情/.test(text) && !/旅游|旅行|天气|规划|票价/.test(text);
