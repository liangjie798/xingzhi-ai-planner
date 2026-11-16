import type { Metadata } from "next";
import { PublicInfo } from "@/components/public-info";
export const metadata: Metadata = { title: "页面不存在 · 行知", description: "你访问的页面不存在或链接已经变化，可以返回介绍页重新开始。", robots: { index: false, follow: false } };
export default function NotFound(){return <PublicInfo illustration="compass" title="这条路，暂时没有抵达。" intro="你访问的页面不存在，或链接已经发生变化。可以返回介绍页，重新开始一次规划。" sections={[{title:"换一个入口继续",body:"使用上方“返回介绍页”，或下方“进入行知”回到工作区。已经保存的对话不会因为当前页面不存在而被删除。"}]} />;}
