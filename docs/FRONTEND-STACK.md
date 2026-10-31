# 前端技术栈

本项目按实际功能选择技术，不为覆盖技术清单而重复引入框架或 SDK。

## 已采用

| 领域 | 当前方案 | 说明 |
| --- | --- | --- |
| 前端框架 | React 19 + Next.js 16 App Router | 满足 Next.js 14+；使用 Server Components、Route Handlers 与流式接口 |
| UI 与样式 | Tailwind CSS 4 + Radix Themes | Tailwind 负责样式组织，Radix Themes 提供可访问的组件基础 |
| 动画 | GSAP + `@gsap/react` | 用于状态切换与反馈动画，并适配 `prefers-reduced-motion` |
| AI 交互 | 服务端模型网关 + SSE | 模型密钥留在服务端，前端消费 `/api/v2/agent/stream` 的工具轨迹与结果事件 |
| 状态与数据 | React 本地状态、LocalStorage、SSE | 当前规模不需要额外引入 Zustand、Jotai 或 TanStack Query |
| 地图与位置 | 高德地图 JSAPI | 提供地图、POI、边界和路线相关能力 |
| 组件开发 | Storybook | `pnpm storybook` 启动组件工作台，`pnpm build-storybook` 验证静态构建 |
| 版本控制 | Git + GitHub | GitHub Actions 执行前端与后端质量检查 |
| 包管理 | pnpm 11 | 由 `packageManager` 和 `pnpm-lock.yaml` 固定工具及依赖版本 |
| 代码规范 | TypeScript + ESLint + Prettier | `pnpm lint` 覆盖业务源码；`pnpm format:check` 检查新增组件工作台与工程配置 |

## 设计协作

Figma 用于原型、组件状态和交互标注，v0.dev 可用于早期界面草案。两者是外部设计流程，不作为运行时依赖。进入代码库的设计必须继续遵守现有 Radix、Tailwind、响应式和无障碍约束。

## 暂不引入

- Vercel AI SDK：现有 Spring Boot Agent 与 SSE 协议已经覆盖流式结果和工具轨迹，替换会造成重复抽象。
- LangChain.js：模型编排位于服务端，浏览器端不直接持有模型密钥。
- Transformers.js、WebGPU、ONNX Runtime Web：当前没有端侧推理需求，也不应增加模型下载和兼容性成本。
- Three.js、React Three Fiber：当前产品以地图和规划工作台为主，没有必要承担额外的 3D 包体积。
- Ant Design、Element Plus、shadcn/ui：项目已选定 Radix Themes，避免并存多个组件系统。
- Web Speech API、MediaPipe：待明确语音或视觉交互需求后再按功能接入。

当前业务源码存在历史格式差异，本次没有用 Prettier 全量重排，以免让纯格式改动掩盖功能差异。新增 Storybook 和工程配置已纳入 `format:check`；后续可按模块逐步扩大格式门禁。

如果后续出现跨页面客户端状态、复杂缓存同步或端侧 AI 的明确需求，再通过独立技术决策记录评估 Zustand、TanStack Query 或浏览器推理方案。
