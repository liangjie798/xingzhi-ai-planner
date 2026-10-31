import { ArrowLeft, Compass } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import s from "./public-info.module.css";

export function PublicInfo({title,intro,sections}:{title:string;intro:string;sections:{title:string;body:string}[]}) {
  return <main className={s.page}><header><Link href="/welcome"><Compass size={28} weight="duotone" />行知</Link><Link href="/welcome"><ArrowLeft size={16} />返回介绍页</Link></header><article><span className={s.eyebrow}>行知 · 产品说明</span><h1>{title}</h1><p className={s.intro}>{intro}</p>{sections.map(section => <section key={section.title}><h2>{section.title}</h2><p>{section.body}</p></section>)}<footer><Link href="/privacy">隐私与数据</Link><Link href="/terms">使用说明</Link><Link href="/login">进入行知</Link></footer></article></main>;
}
