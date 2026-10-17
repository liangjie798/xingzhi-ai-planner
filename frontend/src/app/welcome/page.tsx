"use client";

import { Compass, Gauge, GearSix, MapTrifold, Sparkle,UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ONBOARDED_KEY = "shihou:onboarded";

const steps = [
  {
    icon: Compass,
    title: "① 选定条件",
    text: "搜索或自动定位中国大陆城市及区县，填写日期范围、活动类型、强度与参与人群。",
  },
  {
    icon: MapTrifold,
    title: "② 看懂地图",
    text: "中央地图按图层深浅呈现气温、湿度、AQI、热风险与活动适宜度的空间差异，图例直观可读。",
  },
  {
    icon: Gauge,
    title: "③ 生成决策",
    text: "系统跨日期比较逐小时预报并生成场景化建议；旅游规划会由 AI 编排路线并画在地图上。",
  },
];

export default function WelcomePage() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(ONBOARDED_KEY, "1");
    } catch { /* ignore */ }
  }, []);

  const enter = (href: string) => {
    setLeaving(true);
    router.push(href);
  };

  return (
    <main className={`welcome-page ${leaving ? "is-leaving" : ""}`}>
      <div className="welcome-glow" aria-hidden="true" />
      <section className="welcome-hero">
        <span className="section-kicker">适候 · 户外活动环境决策系统</span>
        <h1>把天气的不确定，<br />变成行程的确定性。</h1>
        <p>
          适候读取 Open-Meteo 实时逐小时预报，为校园、社区与旅行人群计算活动风险与最佳时段，
          并以 AI 编排旅游路线。所有数值计算可解释、可追溯。
        </p>
        <div className="welcome-actions">
          <button type="button" className="analyze-button welcome-primary" onClick={() => enter("/dashboard")}>
            <Sparkle size={19} weight="fill" /> 开始使用
          </button>
          <button type="button" className="welcome-ghost" onClick={() => enter("/hourly")}>先看看逐小时数据</button>
        </div>
      </section>

      <section className="welcome-steps" aria-label="使用三步">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <article className="welcome-card" key={step.title}>
              <Icon size={26} weight="duotone" />
              <h2>{step.title}</h2>
              <p>{step.text}</p>
            </article>
          );
        })}
      </section>

      <section className="welcome-footer">
        <div className="welcome-note">
          <UsersThree size={18} weight="duotone" />
          <span>支持运动会、体育课、社区、训练、研学与旅游规划六类场景，以及四类人群风险修正。</span>
        </div>
        <Link href="/settings" className="welcome-settings">
          <GearSix size={17} /> 接入自己的大模型（默认已接入免费开源模型，无需配置）
        </Link>
      </section>
    </main>
  );
}
