# 参赛代码交付清单

仓库：<https://github.com/liangjie798/xingzhi-ai-planner>，公开可访问。团队成员：刘瀚艇（队长）、石晗喆、郑少卓。

| 要求 | 对应交付与检查方式 |
| --- | --- |
| GitHub / Gitee 托管并可评审访问 | GitHub Public 仓库；未登录时可查看 README、源码与提交记录 |
| 结构清晰、注释有效、遵循代码规范 | 前端 app / components / lib、后端 controller / service / dao / dto / entity 等分层；关键采样、校验、资源释放与兜底逻辑有注释；ESLint、TypeScript 和测试提供检查入口 |
| README 含介绍、技术架构、安装运行、团队 | 根目录 README 包含功能、Mermaid 架构图、跨平台运行步骤、部署与团队表 |
| 完整 Git 历史 | 使用原仓库直接推送，保留全部祖先提交；未重新初始化、压缩提交或伪造成员贡献记录 |
| 完整环境说明及依赖清单 | 根目录、frontend、backend 三份 `.env.example`；`docs/ENVIRONMENT.md`；npm lockfile、Maven pom 和 Wrapper |

## 评审验证

1. 按 README 启动后端与前端；外部服务按需要设置自己的凭证。
2. 在登录页选择访客，在分析台输入“规划杭州未来三天的旅游路线”。
3. 回答“七个大学生”，确认人数与人群没有重复追问。
4. 查看地图、方案文档、数据引用、真实 Agent 工具轨迹。
5. 在终端运行 README 中的 lint、测试和构建命令，或查看仓库 Actions。
6. 在 GitHub Commits 页面查看从早期原型到当前版本的开发过程。

## 公开发布范围

仅发布源码、依赖清单、占位环境模板、运行及功能说明。实际密钥、账户数据、数据库文件、浏览器登录态、构建产物、抓取原文和本机临时文件均不作为交付代码上传。`scripts/check-publish.mjs` 对可达 Git 历史做常见密钥格式及私有环境文件检查；它不等于穷尽式安全审计。

`docs/` 中早期调研与部署说明保留历史名称“适候”；当前项目展示名称为“行知”。第三方依赖与地图、图片、搜索数据分别遵循各自条款。
