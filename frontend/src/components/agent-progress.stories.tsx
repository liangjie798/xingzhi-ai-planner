import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AgentProgress } from "./agent-progress";

const meta = {
  title: "Planning/AgentProgress",
  component: AgentProgress,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AgentProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

const completedSteps = [
  {
    id: "weather",
    name: "读取天气与空气质量",
    detail: "已获得规划日期内的逐小时环境数据。",
    status: "done" as const,
    durationMs: 842,
  },
  {
    id: "places",
    name: "核对候选地点",
    detail: "已结合地点资料与活动条件筛选候选项。",
    status: "done" as const,
    durationMs: 1260,
  },
];

export const Running: Story = {
  args: {
    items: completedSteps,
    running: true,
    phase: "正在编排行程",
  },
};

export const Completed: Story = {
  args: {
    items: completedSteps,
    running: false,
  },
};

export const NeedsVerification: Story = {
  args: {
    items: [
      ...completedSteps,
      {
        id: "tickets",
        name: "核对票价",
        detail: "实时票价服务未启用，当前结果需要出发前再次确认。",
        status: "fallback",
        durationMs: 310,
      },
    ],
    running: false,
  },
};
