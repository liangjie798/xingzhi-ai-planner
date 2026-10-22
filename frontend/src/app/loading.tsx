import { Compass } from "@phosphor-icons/react/dist/ssr";

export default function Loading() {
  return <main className="route-loading" aria-label="页面切换中">
    <div><Compass size={24} weight="duotone" /><strong>适候</strong></div>
    <span /><p>正在衔接数据与页面…</p>
  </main>;
}
