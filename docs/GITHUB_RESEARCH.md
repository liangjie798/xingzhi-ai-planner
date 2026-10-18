# GitHub 调研与原创性说明

调研日期：2026-10-18。

## 参考项目

| 项目 | 许可证 | 借鉴的公开思想 | 本项目的独立实现 |
|---|---|---|---|
| [spring-projects/spring-ai-examples](https://github.com/spring-projects/spring-ai-examples) | Apache-2.0 | 工具回调、RAG Advisor、Agent 模式拆分 | 使用现有 RestClient 手写 DeepSeek Function Calling 规划，不复制示例模块 |
| [qdrant/examples](https://github.com/qdrant/examples) | Apache-2.0 | BM25 与向量结果通过 RRF 融合 | 面向小规模权威资料实现 Java 内存 BM25、中文 n-gram 向量和 RRF |
| [ly1836/spring-ai-rag-demo](https://github.com/ly1836/spring-ai-rag-demo) | Apache-2.0 | 工具轨迹、引用校验、RAG 评测门禁 | 重新设计适候领域 DTO、检索器、引用元数据和测试，没有复制源码或模型文件 |
| [langchain4j/langchain4j](https://github.com/langchain4j/langchain4j) | Apache-2.0 | 高层 Tool API 的职责划分 | 没有引入 LangChain4j 依赖，工具协议直接对接 DeepSeek API |

## 选择理由

项目语料规模目前不足百条，直接部署大型向量数据库会增加比赛演示的内存、启动和运维风险。因此第一版使用本地混合检索，保持可复现和离线可用。`PolicyRagService` 已通过独立接口隔离，语料扩大后可以替换为 BGE-M3＋Qdrant，而不改动 Agent 和前端响应协议。

## 原创性边界

- 未复制上述项目的 Java、TypeScript、SQL、页面或配置文件。
- 未把调研项目作为本项目子模块、模板或二次包装。
- 只采用工具注册、混合检索、引用校验和质量评测等通用架构思想。
- 权威资料只保存比赛原型所需摘录、元数据和政府原文链接。
- 每次功能开发保留独立 Git 提交，便于评审复核开发过程。
