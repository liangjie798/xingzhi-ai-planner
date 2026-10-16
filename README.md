# 适候 · AI 户外活动环境决策平台

面向学校、社区和活动组织者的 Web 决策工具。用户选择城市、时间、活动强度与人群后，系统计算候选时段风险，展示空间图层、执行建议、依据和工具轨迹。

> 当前版本使用九个中国大陆城市的**演示环境快照**，仅用于验证交互与算法流程。没有接入实时天气、空气质量或逐小时预报，不能将当前分数用于真实活动安全决策。接入高德密钥后显示高德底图；地图上的点位指标仍是演示推算值。DeepSeek 密钥存在时仅增强文字解释，不修改风险计算结果。

## 目录结构

```text
amap-jsapi/
├─ frontend/                         Next.js 16 + React 19 + TypeScript
│  ├─ src/app/                       页面、布局、样式
│  ├─ src/components/                地图和决策工作台组件
│  └─ src/lib/                       城市数据、类型与本地风险计算
├─ backend/                          Spring Boot 4.1 + Java 21 + Maven
│  ├─ db/db.sql                       数据库结构参考
│  └─ src/main/
│     ├─ java/com/shihou/
│     │  ├─ annotation/              自定义注解
│     │  ├─ config/                  跨域和模型配置
│     │  ├─ controller/              HTTP 接口与异常处理
│     │  ├─ dao/                     数据访问层
│     │  ├─ dto/                     请求与响应数据结构
│     │  ├─ entity/                  数据库实体
│     │  ├─ interceptor/             请求追踪拦截器
│     │  ├─ service/                 环境、决策、依据与模型服务
│     │  ├─ utils/                   确定性风险计算
│     │  └─ ShihouBackendApplication.java
│     └─ resources/
│        ├─ mapper/                  SQL 映射预留目录
│        ├─ static/upload/           上传文件预留目录
│        ├─ application.yml          本地配置
│        └─ application-prod.yml     生产配置
├─ deploy/nginx.conf                 统一入口反向代理
├─ docker-compose.yml                MySQL、后端、前端、Nginx
└─ .env.example                      部署环境变量模板
```

这沿用了参考图片的 Spring Boot 分层目录。前端单独放在 `frontend/`，便于 TypeScript 构建、静态资源优化和独立部署。

## 本地运行

要求：Node.js 22、npm、JDK 21。Windows 当前安装的两个版本位于 `G:\JavaVersions\jdk8u152` 与 `G:\JavaVersions\jdk21.0.12`。本项目使用 Java 21。

```powershell
# 终端 1：启动后端，默认使用 H2 演示数据库
cd 'G:\Ai Web\amap-jsapi\backend'
./run-dev.ps1

# 终端 2：启动前端
cd 'G:\Ai Web\amap-jsapi\frontend'
Copy-Item .env.example .env.local
npm ci
npm run dev
```

访问 `http://localhost:3000`。前端开发服务器把 `/api/*` 转发至 `localhost:8080`。未提供高德密钥时，地图展示明确标记的演示空间图层。

切换当前 PowerShell 会话的 Java 版本：

```powershell
$env:JAVA_HOME = 'G:\JavaVersions\jdk21.0.12' # 或 G:\JavaVersions\jdk8u152
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
javac -version
```

## 配置与部署

复制根目录 `.env.example` 为 `.env`，填写 MySQL 密码。`DEEPSEEK_API_KEY` 和高德 JSAPI Key 可留空以运行演示模式。浏览器端高德地图还需要安全密钥或代理地址，对应 `NEXT_PUBLIC_AMAP_SECURITY_CODE` 或 `NEXT_PUBLIC_AMAP_SERVICE_HOST`。前端公开变量会在镜像构建时写入客户端包，请按高德控制台的域名白名单限制 Key。不要提交 `.env`。

```bash
docker compose up -d --build
docker compose ps
```

默认开放 80 端口。生产服务使用 MySQL 8.4；Spring JPA 首次运行创建表。部署到公网前应配置域名、HTTPS 和数据源授权。阿里云服务器需要放行 80/443 端口。

## API

- `GET /api/v1/cities`：城市演示快照。
- `POST /api/v1/decisions/analyze`：候选时段计算、依据检索与建议生成。
- `GET /actuator/health`：后端健康检查。

## 当前范围与下一步

当前依据库是内置规则摘录，尚未完成向量检索；Agent 轨迹来自实际后端步骤，但模型当前只承担解释生成。参赛正式版应加入中国大陆有授权的数据源、观测时间及站点溯源、逐小时预报、可核验的政策文档检索与模型工具调用。实时数据接入前，产品会持续标明演示模式。

团队信息：待参赛团队填写。

