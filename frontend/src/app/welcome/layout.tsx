import type { Metadata } from "next";

const questions = [
  ["第一次使用，需要注册吗？", "可以先在登录页选择访客体验。想把规划留在自己的账户里，再注册或登录。"],
  ["还没有想好完整行程，能开始吗？", "可以。先说目的地或活动想法，日期、人数和偏好会在对话中逐步确认，也可以随时修改。"],
  ["天气数据和 AI 回答有什么区别？", "天气与空气质量使用数据服务；AI 负责理解需求和组织建议。资料来源与无法核实的内容会在回答中说明。"],
  ["可以查询机票和火车票吗？", "机票工具可读取部分已接入航司的官网展示价，不能保证覆盖所有航线或最终含税价。火车票目前提供12306查询入口。"],
  ["生成的规划可以带走吗？", "旅行和活动方案支持下载 Word、Markdown，也可以通过浏览器打印或保存为 PDF。"],
  ["出发前，还需要核对什么？", "请再次核对天气预警、景点开放与预约、交通余票和现场条件。AI 规划是建议，不替代官方通知和现场判断。"],
];

export const metadata: Metadata = {
  title: "行知 · AI 活动与旅行规划",
  description: "把想去的地方、想做的事告诉行知：一起看天气、排日程，把一句想法变成可执行的旅行与活动安排。",
  alternates: { canonical: "/welcome" },
  openGraph: {
    url: "/welcome",
    title: "行知 · 让每次出发，都有准备",
    description: "把想去的地方、想做的事告诉行知：一起看天气、排日程，把一句想法变成可执行的旅行与活动安排。",
    images: [{ url: "https://lht574.cn/images/xingzhi-share.jpg", width: 1200, height: 630, type: "image/jpeg", alt: "行知 · 绿色山谷与蜿蜒河流" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "行知 · 让每次出发，都有准备",
    description: "把想去的地方、想做的事告诉行知：一起看天气、排日程，把一句想法变成可执行的旅行与活动安排。",
    images: ["https://lht574.cn/images/xingzhi-share.jpg"],
  },
};

const faqStructuredData = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: questions.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })),
}).replace(/</g, "\\u003c");

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqStructuredData }} />
      {children}
    </>
  );
}
