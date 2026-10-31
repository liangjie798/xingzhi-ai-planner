import { existsSync } from "node:fs";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { allowedAirlineUrl, type AirlineProvider } from "./airline-providers.ts";
import { airlinePageBarrier, parseAirlinePage } from "./airline-parsing.ts";
import type { AirlineAttempt, AirlinePageObservation, AirlineQuote, ResolvedFlightQuery } from "./airline-types.ts";

let browserJob: Promise<Browser> | undefined;
let closingJob: Promise<void> | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
async function settleWithin(job:Promise<unknown>,milliseconds:number) {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([job.then(()=>true,()=>true),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),milliseconds);})]);}
  finally{clearTimeout(timer);}
}
function executable() {
  const configured = process.env.AIRLINE_BROWSER_EXECUTABLE?.trim();
  if (configured) return existsSync(configured) ? configured : undefined;
  return ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
}
async function browser(): Promise<Browser> {
  clearTimeout(idleTimer);
  if(closingJob&&!await settleWithin(closingJob,2000))throw new Error("Timeout waiting for browser cleanup");
  if (!browserJob) browserJob = (async () => {
    const path = executable();
    if (!path) throw new Error("browser-not-configured");
    const { chromium } = await import("playwright-core");
    const instance = await chromium.launch({ executablePath:path,headless:true,chromiumSandbox:true,args:["--disable-dev-shm-usage"],timeout:12_000 });
    const current=browserJob;
    instance.on("disconnected",()=>{if(browserJob===current)browserJob=undefined;});
    return instance;
  })().catch(error=>{browserJob=undefined;throw error;});
  return browserJob;
}
export async function closeAirlineBrowser() {
  clearTimeout(idleTimer);
  const running = browserJob; browserJob=undefined;
  if(running){
    const job=(async()=>{await (await running.catch(()=>undefined))?.close().catch(()=>{});})();
    closingJob=job;void job.finally(()=>{if(closingJob===job)closingJob=undefined;});
    await settleWithin(job,3000);
  }
}
export function airlineBrowserConfigured() { return process.env.AIRLINE_BROWSER_ENABLED === "1" && Boolean(executable()); }

/** Read only browser DOM; no API replay, account storage, CAPTCHA solving or order creation. */
export async function readAirlinePage(page: Page, provider: AirlineProvider, query: ResolvedFlightQuery): Promise<AirlinePageObservation> {
  return page.evaluate(({code,from,to})=>{
    const fullText=document.body.textContent||"";
    const text=fullText.length>80000?fullText.slice(0,40000)+fullText.slice(-40000):fullText;
    const visibility=new WeakMap<Element,boolean>();
    const visible=(e:Element):boolean=>{
      const saved=visibility.get(e);if(saved!==undefined)return saved;
      const style=getComputedStyle(e);
      const value=!e.hasAttribute('hidden')&&e.getAttribute('aria-hidden')!=="true"&&!(e instanceof HTMLInputElement&&e.type==="hidden")&&style.display!=="none"&&style.visibility!=="hidden"&&style.visibility!=="collapse"&&style.opacity!=="0"&&(!e.parentElement||visible(e.parentElement));
      visibility.set(e,value);return value;
    };
    const inputs=[...document.querySelectorAll("input")].filter(visible).map(e=>({value:e.value,identity:[e.id,e.name,e.placeholder,e.getAttribute("aria-label")].join(" ")}));
    const dateInput=inputs.find(e=>/出发日期|去程日期|depart|orgDate|flydate|fdate/i.test(e.identity)&&!/(?:return|retfdate|返程|回程)/i.test(e.identity));
    const dates=inputs.map(e=>e.value).filter(v=>/^20\d{2}[-/]\d{2}[-/]\d{2}(?:\s.*)?$/.test(v));
    let pageDate:string|undefined=dateInput?.value || dates[0];
    if(!pageDate) pageDate=text.match(/(?:去程[：:]?\s*[^\n]*\n?\s*|单程\s*[^\n]*\n\s*)(20\d{2}[-/年]\d{2}[-/月]\d{2}日?)/)?.[1];
    if(!pageDate&&code==="MU")pageDate=text.slice(0,500).match(/20\d{2}年\d{2}月\d{2}日/)?.[0];
    if(!pageDate)pageDate=text.match(new RegExp(from.name+"\\s*"+to.name+"\\s*(20\\d{2}-\\d{2}-\\d{2})"))?.[1];
    const route=new RegExp(from.name+"[\\s\\S]{0,16}"+to.name);
    const routeText=text.slice(0,Math.min(text.length,10_000));
    const hasHeading=code==="MU"?new RegExp("单程\\s+"+from.name+"\\s+"+to.name+"\\s+20\\d{2}").test(text.replace(/\s+/g," ")):route.test(routeText);
    const originLabel=inputs.find(e=>e.value.includes(from.name))?.value || (hasHeading?from.name:undefined);
    const destinationLabel=inputs.find(e=>e.value.includes(to.name))?.value || (hasHeading?to.name:undefined);
    const cache=new WeakMap<Element,string>();
    const clean=(e:Element|null):string=>{
      if(!e)return "";const saved=cache.get(e);if(saved!==undefined)return saved;
      const walk=(node:Node):string=>{
        if(node.nodeType===Node.TEXT_NODE)return node.textContent||"";
        if(!(node instanceof Element)||['SCRIPT','STYLE','NOSCRIPT','TEMPLATE'].includes(node.tagName)||!visible(node))return "";
        const block=/^(DIV|LI|P|SECTION|ARTICLE|TR|TD|H[1-6]|BR)$/.test(node.tagName);
        const value=[...node.childNodes].map(walk).join('');return block?'\n'+value+'\n':value;
      };
      const value=walk(e).trim();cache.set(e,value);return value;
    };
    if(code==="CZ") {
      const rows=[...document.querySelectorAll("li.zls-flight-cell")].filter(visible).map(e=>{
        const dep=e.querySelector(".zls-flgtime-dep"),arr=e.querySelector(".zls-flgtime-arr"),cabin=e.querySelector('.zls-cabin-cell[data-cabin="3"]');
        return {text:clean(e),flightNumber:clean(e.querySelector(".zls-flgno-info")).match(/CZ\d{3,4}/)?.[0],priceText:cabin&&!cabin.classList.contains("disabled")?cabin.getAttribute("data-value")||"":"",cabin:"经济舱 · 官网展示价",departure:clean(dep).match(/\d{2}:\d{2}/)?.[0],arrival:clean(arr).match(/\d{2}:\d{2}/)?.[0],departureDate:dep?.getAttribute("data-value")?.slice(0,8),arrivalDate:arr?.getAttribute("data-value")?.slice(0,8),originCode:e.getAttribute("data-dep")||undefined,destinationCode:e.getAttribute("data-arr")||undefined,originStation:clean(dep?.querySelector(".zls-flplace")||null),destinationStation:clean(arr?.querySelector(".zls-flplace")||null),stops:e.querySelector(".zls-flg-dir")?0:undefined};
      });
      return {url:location.href,text,pageDate,originLabel,destinationLabel,rows};
    }
    if(code==="MF") {
      const rows=[...document.querySelectorAll(".list-group")].filter(visible).map(e=>{
        const cabin=[...e.querySelectorAll(".price-item")].find(c=>clean(c.querySelector(".price-cabin"))==="经济舱");
        return {text:clean(e),flightNumber:clean(e.querySelector(".flight-num > span")),priceText:clean(cabin?.querySelector("strong")||null),cabin:"经济舱 · 官网展示起价",departure:clean(e.querySelector(".start .time")),arrival:clean(e.querySelector(".end .time")),originStation:clean(e.querySelector(".start .plane")),destinationStation:clean(e.querySelector(".end .plane")),stops:/直飞/.test(clean(e))?0:/经停|中转/.test(clean(e))?1:undefined};
      });
      return {url:location.href,text,pageDate,originLabel,destinationLabel,rows};
    }
    const prefix=code==="OQ"?"(?:CZ|OQ)":code;
    const leafPattern=new RegExp("(?:^|[^A-Z0-9])"+prefix+"\\s*\\d{3,4}(?!\\d)");
    const numbersPattern=new RegExp("(?:^|[^A-Z0-9])("+prefix+"\\s*\\d{3,4})(?!\\d)","g");
    const candidates=new Set<Element>();
    const leaves=[...document.querySelectorAll("span,div,p,li,a,strong")].filter(e=>visible(e)&&(e.textContent?.trim().length||0)<90&&leafPattern.test(e.textContent?.trim()||"")).slice(0,160);
    for(const leaf of leaves){
      let ancestor:Element|null=leaf;
      for(let depth=0;ancestor&&depth<10;depth++,ancestor=ancestor.parentElement){
        const value=clean(ancestor);if(value.length>12_000)break;
        const own=[...new Set([...value.matchAll(numbersPattern)].map(m=>m[1].replace(/\s/g,"")))];
        const physical=code==="OQ"?own.filter(f=>f.startsWith(value.includes("CZ")?"CZ":"OQ")):own;
        if(physical.length>1)break;
        if(physical.length===1&&(value.match(/\d{2}:\d{2}/g)||[]).length>=2&&(/[¥￥]\s*\d|\d+\s*元/.test(value)||code==="KN"&&/\n\s*\d{2,5}\s*$/.test(value))){candidates.add(ancestor);break;}
      }
    }
    return {url:location.href,text,pageDate,originLabel,destinationLabel,rows:[...candidates].slice(0,100).map(e=>({text:clean(e)}))};
  },{code:provider.code,from:query.from,to:query.to});
}

export async function probeAirline(provider: AirlineProvider, query: ResolvedFlightQuery, signal?: AbortSignal, observe?: (page:AirlinePageObservation)=>Promise<void>): Promise<{ attempt: AirlineAttempt; quotes: AirlineQuote[] }> {
  const checkedAt=new Date().toISOString();
  const attempt:AirlineAttempt={airlineCode:provider.code,sourceName:provider.name,state:"unverified-page",sourceUrl:provider.home,checkedAt,quoteCount:0,airportScope:`${query.from.name} → ${query.to.name}；机场以具体航班为准，未保证覆盖同城全部机场`};
  let context:BrowserContext|undefined;
  const cancel=()=>{void context?.close().catch(()=>{});};
  try{
    if(signal?.aborted)return {attempt:{...attempt,state:"cancelled"},quotes:[]};
    context=await(await browser()).newContext({viewport:{width:1440,height:1000},locale:"zh-CN",timezoneId:"Asia/Shanghai",acceptDownloads:false,serviceWorkers:"block",ignoreHTTPSErrors:false});
    if(signal?.aborted)throw new Error("request-cancelled");
    signal?.addEventListener("abort",cancel,{once:true});
    // Only airline and explicitly named static CDN hosts can be reached by page scripts.
    const staticHosts=["at.alicdn.com","g.alicdn.com","cdn.jsdelivr.net","cdnjs.cloudflare.com"];
    await context.route("**/*",route=>{
      const request=route.request();let host="";try{host=new URL(request.url()).hostname;}catch{return route.abort();}
      const allowed=allowedAirlineUrl(request.url(),provider)||staticHosts.includes(host);
      return !allowed||["media","font"].includes(request.resourceType())?route.abort():route.continue();
    });
    const page=await context.newPage();page.setDefaultTimeout(1800);
    await page.goto(provider.url(query),{waitUntil:"domcontentloaded",timeout:20_000});
    const deadline=Date.now()+16_000;let observation:AirlinePageObservation|undefined;
    do{
      if(signal?.aborted)throw new Error("request-cancelled");
      const readiness=await page.evaluate(code=>{
        const text=document.body?.textContent||"";
        const prefix=code==="OQ"?"(?:CZ|OQ)":code;
        return {text:text.slice(0,80000),ready:new RegExp(prefix+"\\s*\\d{3,4}").test(text)&&(text.match(/\d{2}:\d{2}/g)||[]).length>=2};
      },provider.code);
      const blocked=airlinePageBarrier(readiness.text,page.url());
      if(blocked)return {attempt:{...attempt,state:blocked},quotes:[]};
      if(!readiness.ready){await page.waitForTimeout(600);continue;}
      observation=await readAirlinePage(page,provider,query);
      if(airlinePageBarrier(observation.text,observation.url)||parseAirlinePage(provider,query,observation,new Date().toISOString()).quotes.length)break;
      await page.waitForTimeout(600);
    }while(Date.now()<deadline);
    if(!observation)return {attempt,quotes:[]};
    if(observe)await observe(observation);
    const parsed=parseAirlinePage(provider,query,observation,new Date().toISOString());
    const sourceUrl=allowedAirlineUrl(observation.url,provider)?new URL(observation.url).origin+new URL(observation.url).pathname:provider.home;
    return {attempt:{...attempt,state:parsed.state,checkedAt:new Date().toISOString(),quoteCount:parsed.quotes.length,sourceUrl},quotes:parsed.quotes};
  }catch(error){
    const text=error instanceof Error?error.message:"";
    const state=signal?.aborted?"cancelled":text.includes("CERT_")?"tls-error":/Timeout/i.test(text)||error instanceof Error&&error.name==="TimeoutError"?"timeout":text==="browser-not-configured"?"not-configured":"unverified-page";
    return {attempt:{...attempt,state},quotes:[]};
  }finally{
    signal?.removeEventListener("abort",cancel);
    if(context&&!await settleWithin(context.close(),2000))void closeAirlineBrowser();
    idleTimer=setTimeout(()=>{void closeAirlineBrowser();},30_000);idleTimer.unref?.();
  }
}
