# 行知 AI 活动与旅行规划

行知是面向个人出游和小团队旅行的 AI 规划 Web 应用。用户用自然语言描述目的地、日期、人数和偏好，系统逐步确认条件，结合天气、空气质量、地点资料与交通查询，生成可继续修改、查看依据和导出的旅行安排。

本 README 面向源码审核、项目体验与本地开发，适用于解压后的 `xingzhi-source` 文件夹。请先完整解压，再执行启动文件；不要直接在压缩软件内双击 BAT。

| 项目入口 | 地址 |
| --- | --- |
| 在线演示 | <https://lht574.cn/XingZhi> |
| 线上交通比价 | <https://lht574.cn/transport> |
| 业务源码与开发记录 | <https://github.com/liangjie798/xingzhi-ai-planner> |
| 独立测试材料 | <https://github.com/liangjie798/xingzhi-ai-planner-qa> |

团队成员：刘瀚艇（队长）、石晗喆、郑少卓。项目早期名称为“适候”，因此 Java 包名、应用标识和部分历史代码仍使用 `shihou`，不影响当前产品名称与启动方式。

## 目录

1. [项目功能](#1-项目功能)
2. [技术架构与目录结构](#2-技术架构与目录结构)
3. [运行环境与外部依赖](#3-运行环境与外部依赖)
4. [Windows 首次启动](#4-windows-首次启动)
5. [BAT 参数与自动环境准备](#5-bat-参数与自动环境准备)
6. [配置说明](#6-配置说明)
7. [建议体验流程](#7-建议体验流程)
8. [交通查询说明](#8-交通查询说明)
9. [构建与测试](#9-构建与测试)
10. [Linux 与 macOS 本地运行](#10-linux-与-macos-本地运行)
11. [常见问题](#11-常见问题)
12. [数据边界与审核包说明](#12-数据边界与审核包说明)

## 1 项目功能

| 模块 | 主要能力 |
| --- | --- |
| 多轮旅行对话 | 逐步确认目的地、日期、人数、人群与偏好，追问缺失信息，支持继续修改条件 |
| 环境分析 | 读取天气、降雨、空气质量等数据，比较候选时段，说明风险与调整原因 |
| 环境地图 | 展示行政区域、候选地点和旅行站点，辅助查看目的地及路线顺序 |
| 旅行方案 | 组织景点、美食、交通与休息，生成按日、按时段安排及备用建议 |
| 交通比价 | 在独立页面同时发起飞机与火车查询，分别展示有效票价和出发、到达时间 |
| 行程管理 | 补充旅行安排、同行信息及费用，查看资料、保存和比较方案版本 |
| 资料与证据 | 展示检索来源、关联地点与核对状态，支持个人资料收藏 |
| Agent 轨迹 | 呈现实际工具步骤、执行状态、耗时以及失败或兜底原因 |
| 规划书导出 | 下载 Word、Markdown，或通过浏览器打印保存 PDF |
| 账户与管理 | 用户登录、访客体验、会话记录、账户模型设置及独立管理员入口 |

旅行规划是当前主要体验方向。代码还保留研学、社区及其他活动场景。资料收藏是用户管理链接与笔记的功能，不等同于自动参与模型检索的知识库。

## 2 技术架构与目录结构

### 2.1 技术选型

| 层次 | 当前项目使用的技术 |
| --- | --- |
| 前端 | Next.js 16.4.2、React 19、TypeScript |
| 样式与交互 | Tailwind CSS 4、Radix Themes、GSAP、Phosphor Icons |
| 后端 | Java 21、Spring Boot 4.1、Spring Security、Spring Data JPA |
| 数据存储 | 本地默认内存 H2；生产配置支持 MySQL |
| 地图与地点 | 高德地图 JSAPI、POI 服务、DataV 行政边界 |
| 环境数据 | Open-Meteo 天气与空气质量服务 |
| AI 与检索 | 兼容模型接口、Function Calling、混合 RAG、百度千帆搜索；Tavily 可选 |
| 交通查询 | 航司官网只读浏览器工具、12306公开查询、缓存和结果校验 |
| 文档与验证 | docx、Node.js 测试、Maven 测试、ESLint、TypeScript、Storybook |

精确依赖以 `frontend/package.json`、`frontend/pnpm-lock.yaml` 和 `backend/pom.xml` 为准。

### 2.2 处理流程

```text
用户输入旅行需求
    ↓
确认目的地、日期、人数与偏好
    ↓
查询天气、空气质量、地图地点、联网资料与所需交通信息
    ↓
程序校验与规则分析 + 大模型理解、编排和解释
    ↓
展示行程、地图、数据依据与 Agent 执行轨迹
    ↓
继续修改、记录费用、收藏资料、导出规划书
```

环境数值、票价和规则评分由数据服务与程序产生，模型不负责凭空补造这些数值。后端混合检索结合 BM25、本地中文 n-gram 向量与 RRF 排序，为安全和应急建议提供参考资料；本地向量方法不等同于独立训练了语义嵌入模型。

### 2.3 审核包目录

```text
xingzhi-source/
├── README.md                         本说明
├── start-backend.bat                  Windows 后端启动入口
├── scripts/
│   ├── start-backend.ps1              配置加载、端口检查与服务启动
│   └── backend-environment.ps1        JDK/Maven 检查、下载、校验和安装
├── backend/
│   ├── pom.xml                       Maven 依赖与 Java 版本
│   ├── mvnw / mvnw.cmd                Maven Wrapper
│   ├── .mvn/wrapper/                  Maven 固定版本配置
│   ├── .env.example                  后端配置模板
│   ├── run-dev.ps1                    兼容旧启动入口
│   └── src/
│       ├── main/java/                控制器、服务、数据访问、账户与分析逻辑
│       ├── main/resources/           应用配置与检索语料
│       └── test/                     后端测试源码
└── frontend/
    ├── package.json                  前端依赖与开发命令
    ├── pnpm-lock.yaml                依赖锁定文件
    ├── .env.example                  前端配置模板
    ├── next.config.ts                开发代理与 Next.js 配置
    ├── .storybook/                   组件开发配置
    ├── public/                       页面实际使用的静态资源
    ├── scripts/                      构建前配置检查
    ├── tests/                        前端测试源码
    └── src/
        ├── app/                      页面、服务端路由与全局样式
        ├── components/               对话、地图、方案及工作区组件
        └── lib/                      模型、检索、行程、交通与数据处理
```

实际环境配置文件、数据库、`node_modules`、`.next`、`target` 和 `.tools` 均不随审核包提供。首次运行后按需生成这些内容。解压 ZIP 不需要 Git；Git 仅用于查看仓库和开发记录。

## 3 运行环境与外部依赖

### 3.1 软件环境

| 环境 | 要求 | 准备方式 |
| --- | --- | --- |
| Windows | 64位 Windows，带 Windows PowerShell 5.1 或兼容环境 | 使用 BAT 自动启动流程 |
| Java | JDK 21，匹配本机 CPU 架构 | BAT 自动检测；缺失或不符时下载 |
| Maven | 与 Wrapper 配置一致，当前3.10.0 | BAT 检测系统、缓存与项目安装；按需下载 |
| Node.js | 本项目要求22及以上，建议使用22.x复现开发环境 | 前端需自行安装，BAT不会安装 |
| pnpm | 项目固定11.25.0 | 前端需自行安装 |
| 浏览器 | 支持现代 JavaScript 的浏览器 | 访问前端页面 |
| 航司查询浏览器 | Windows 可使用已安装的 Microsoft Edge | 只有启用航司官网查询时需要 |
| 数据库 | 本地默认不需要外部数据库 | 使用内存 H2 |

Node.js 可从[官方页面](https://nodejs.org/en/download)选择22.x版本。安装后重新打开终端，执行：

```powershell
node --version
npm --version
npm install -g pnpm@11.25.0
pnpm --version
```

这里固定 pnpm 版本以匹配项目的 `packageManager` 与锁定文件，不要求安装当前最新版本。安装方式可参考 [pnpm 官方说明](https://pnpm.io/installation)。

### 3.2 基础运行与完整体验的区别

后端在默认配置下可以使用 H2 启动，不要求提前配置 MySQL 或付费模型。完整体验还需要按功能准备外部服务：

- 地图展示需要有效的高德 JSAPI Key 及对应安全配置。
- 大模型回答需要可用的账户模型配置或服务端模型配置，以及模型服务额度。
- 联网攻略检索需要对应搜索服务密钥；搜索密钥与模型密钥分别配置。
- 天气、空气质量、铁路及航司信息需要能够访问相应外部网站或服务。

未配置某项外部能力时，不应把提示、受限结果或规则方案视为该外部服务已经成功调用。

## 4 Windows 首次启动

以下 PowerShell 命令均从解压后的 `xingzhi-source` 根目录执行，前端命令另外注明。建议先使用默认后端8080、前端3000端口。

### 第一步 复制配置模板

```powershell
if (-not (Test-Path .\backend\.env)) {
    Copy-Item .\backend\.env.example .\backend\.env
}
if (-not (Test-Path .\frontend\.env.local)) {
    Copy-Item .\frontend\.env.example .\frontend\.env.local
}
```

用文本编辑器打开这两个新文件，将 `MODEL_CONFIG_SECRET` 替换为同一个自行生成的长随机字符串。可用下面的命令生成后复制到两处：

```powershell
[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

已有账户模型数据时，不要随意更换这个值。填写地图、模型及搜索配置的方法见第6节；不要把真实密钥写进源码或提交到公开仓库。

### 第二步 启动后端

双击根目录的 `start-backend.bat`，或执行：

```powershell
.\start-backend.bat
```

启动器会依次完成：

1. 读取项目要求并检查 JDK 主版本、CPU 架构和可执行性。
2. 检查固定版本 Maven；缺失时显示下载进度并自动准备环境。
3. 读取 `backend/.env`，检查端口，设置本次进程所需环境。
4. 使用 Maven 编译源码并启动 Spring Boot 服务。

初次工具下载后还可能出现 Maven 依赖下载，需等待控制台出现 `Started ShihouBackendApplication`。访问：

<http://localhost:8080/actuator/health>

当响应中 `status` 为 `UP` 时，后端已就绪。它是健康接口，不是产品首页。保持这个窗口运行，不要关闭。

### 第三步 启动前端

在另一个 PowerShell 窗口中，进入同一项目根目录后执行：

```powershell
cd .\frontend
pnpm install --frozen-lockfile
pnpm dev
```

等待终端显示本地地址后访问：

- 产品入口：<http://localhost:3000/welcome>
- 业务工作区：<http://localhost:3000/XingZhi>
- 交通比价：<http://localhost:3000/transport>
- 登录页：<http://localhost:3000/login>

可在登录页选择访客体验。账户模型设置等功能需按界面要求使用普通用户账户。

**BAT只启动后端，不会自动启动前端。** 后端和前端两个窗口需要同时保持运行。使用 Ctrl+C 分别停止对应服务；默认内存 H2 会在后端重启后清空本地记录。

## 5 BAT 参数与自动环境准备

| 命令 | 用途 |
| --- | --- |
| `start-backend.bat` | 检查并按需安装环境，然后编译启动后端 |
| `start-backend.bat -CheckOnly` | 只检查环境和端口，不下载安装、不启动 |
| `start-backend.bat -InstallOnly` | 检查并准备环境，不启动服务 |
| `start-backend.bat -LocalEnvironment` | 使用项目私有环境，不复用系统 Java/Maven |
| `start-backend.bat -LocalEnvironment -InstallOnly` | 提前准备项目独立运行环境 |
| `start-backend.bat -Port 18080` | 使用其他后端端口；同时注意前端代理配置 |
| `start-backend.bat -UseJar` | 启动已经构建的 JAR；不要求 Maven，不自动构建 JAR |

在 PowerShell 中调用时，在命令前加 `.\`。

### 自动准备规则

- Java 主版本来自 `backend/pom.xml`，当前为21；21的不同补丁版本可复用，Java 8、17、25等其他主版本不作为当前要求的匹配环境。
- Maven 精确版本来自 `backend/.mvn/wrapper/maven-wrapper.properties`，当前为3.10.0。
- 启动器检查 `JAVA_HOME`、PATH、常见安装目录、Maven Wrapper 缓存及项目 `.tools`。已有匹配环境时跳过工具下载。
- JDK 从 Adoptium 官方接口获得下载地址与 SHA-256；Maven 使用项目指定的 Apache 下载地址及 SHA-512。下载显示进度条、百分比和数据量，校验后再解压。
- 工具安装在 `.tools/jdk`、`.tools/maven`，下载缓存在 `.tools/downloads`。不需要管理员权限，不改系统安装和永久环境变量。
- 下载中断会重试。准备失败时停止启动；重新运行可复用已经校验通过的缓存或已安装环境。
- `-CheckOnly` 是检查模式，不会帮缺失环境执行安装；普通双击或 `-InstallOnly` 才会自动准备。

工具可复用不等于整个项目能离线启动：首次 Maven 与 pnpm 依赖安装仍需网络；天气、地图、模型和票务查询也需要相应网络服务。

## 6 配置说明

### 6.1 后端配置

位置：`backend/.env`，模板为 `backend/.env.example`。

| 变量 | 用途与默认建议 |
| --- | --- |
| `SERVER_PORT` | 后端端口，默认8080 |
| `FRONTEND_ORIGIN` | 本地前端来源，默认 `http://localhost:3000` |
| `SESSION_COOKIE_SECURE` | 本地 HTTP 使用 `false`；HTTPS 部署按实际设置 |
| `MODEL_CONFIG_SECRET` | 账户模型配置密钥，必须与前端同名变量一致 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 可选管理员初始化；密码为空时不创建管理员 |
| `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD` | 可选超级管理员初始化 |
| `DEEPSEEK_API_KEY` | 可选后端模型服务密钥 |
| `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | 后端模型地址与名称，按已开通服务填写 |

Windows BAT 会显式加载这个 `.env`；直接执行 Maven 不会自动加载它。启动器支持简单 `KEY=value` 和成对引号，不执行其中的命令；已有进程环境变量优先，显式 `-Port` 参数优先于 `SERVER_PORT`。

本地默认数据库为 `jdbc:h2:mem:shihou`，无需安装 MySQL。生产配置 `application-prod.yml` 需要单独提供 `DATABASE_URL`、`DATABASE_USERNAME`、`DATABASE_PASSWORD`；不要在未配置数据库时直接启用 `prod` 配置。

### 6.2 前端配置

位置：`frontend/.env.local`，修改后重启前端开发服务。

| 变量 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_AMAP_KEY` | 高德地图 Web JSAPI Key |
| `NEXT_PUBLIC_AMAP_SECURITY_CODE` | 高德 JSAPI 安全密钥配置；按平台授权要求使用 |
| `NEXT_PUBLIC_AMAP_SERVICE_HOST` | 可选高德安全代理地址 |
| `NEXT_PUBLIC_API_BASE_URL` | API 基础地址；默认开发代理场景留空 |
| `BACKEND_INTERNAL_URL` | 服务端访问后端，默认 `http://127.0.0.1:8080` |
| `MODEL_CONFIG_SECRET` | 必须与后端配置一致 |
| `WEB_SEARCH_PROVIDER` | 默认 `baidu`，可选 `tavily` |
| `BAIDU_SEARCH_API_KEY` / `TAVILY_API_KEY` | 对应搜索服务密钥，按选择配置 |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | 可选前端服务端 DeepSeek 配置 |
| `SILICONFLOW_API_KEY` / `SILICONFLOW_MODEL` | 可选前端服务端模型配置 |
| `AMAP_WEB_SERVICE_KEY` | 可选独立高德 REST 服务 Key |
| `AIRLINE_BROWSER_ENABLED` | 航司官网查询开关，模板默认0；启用填1 |
| `AIRLINE_BROWSER_EXECUTABLE` | 可选浏览器可执行文件绝对路径 |

模型也可在用户账户设置中配置。前端服务端与 Java 后端是两个进程：只在 `backend/.env` 填写模型密钥，不代表所有 Next.js 模型路由也读取到了它。请按实际使用的调用方式，在对应进程或账户中配置。

`NEXT_PUBLIC_` 变量会用于客户端；不要给模型密钥或搜索密钥加此前缀。压缩包只提供配置模板，不提供可用于调用服务的真实密钥。

### 6.3 开发代理与端口

默认开发环境中，浏览器访问前端3000端口；`frontend/next.config.ts` 将 `/api/*` 转发到 `http://localhost:8080/api/*`，Next.js 服务端还会使用 `BACKEND_INTERNAL_URL`。

如改为 `-Port 18080`，请同时修改：

1. `frontend/.env.local` 的 `BACKEND_INTERNAL_URL=http://127.0.0.1:18080`。
2. `frontend/next.config.ts` 开发 rewrite 的目标端口为18080。
3. 重启前端服务。

仅修改 BAT 端口不会自动修改前端代理。为方便审核体验，优先保持8080和3000均未被其他程序占用。

## 7 建议体验流程

1. 启动前后端，访问登录页，选择访客或注册普通账户。
2. 根据需要配置可用模型，确认地图与搜索服务配置状态。
3. 新建对话，输入“帮我规划杭州未来三天的旅行，五名大学生，节奏轻松一些”。根据追问确认实际日期和偏好。
4. 查看分析台与环境地图，核对目的地、日期和环境数据。
5. 阅读执行方案，在数据与证据及 Agent 轨迹中检查来源和实际工具执行状态。
6. 继续输入“减少一个景点，多留一些休息时间”等条件，观察重排结果。
7. 进入交通比价页，输入出发地、目的地和预售范围内日期，查看飞机与火车分别加载的结果。
8. 补充费用、收藏资料或保存方案，尝试下载 Word、Markdown 或打印保存 PDF。

管理员入口为 `/admin/login`，用于管理功能；管理员会话与普通业务体验分开。不要把管理员账户当作普通旅行用户进行业务体验。

多轮记忆围绕当前会话保存已确认条件，不承诺无限长度上下文。新建或切换对话后，应核对对应会话的日期、地点和人数；本地 H2 重启后记录会被清空。

## 8 交通查询说明

### 8.1 飞机

- 页面：`/transport`，与分析台独立。
- 只读工具：`search_domestic_flights`；工具清单和调用入口为 `/agent-tools`。
- 当前正式验收启用厦门航空、山东航空、江西航空、天津航空、长安航空，按路线选择来源，每次并非查询全部航司。
- 不抓取货运、集团实体或无法取得有效票价的来源；未通过云端验收的适配器不作为线上可用能力。
- 启用前在前端配置 `AIRLINE_BROWSER_ENABLED=1`。Windows 自动检查常见位置的 Edge；使用其他已安装的兼容 Chromium 浏览器时，显式设置其可执行路径。
- 官网访问受网络、航线、日期、页面变化与访问限制影响，无法保证每次都有报价。

例如，可将浏览器路径按本机实际位置填写为：

```dotenv
AIRLINE_BROWSER_ENABLED=1
AIRLINE_BROWSER_EXECUTABLE=C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe
```

这是服务端浏览器进程，不是用户浏览器插件。程序不登录、不破解验证码、不创建订单；官网展示价不保证为最终含税支付价或全网最低价。

### 8.2 火车

- 只读工具：`search_domestic_trains`；正常读取12306公开页面公布的查询入口，使用同一匿名会话查询车次及席别价格。
- 同时展示可核实票价、出发时间、到达时间和历时；最多展示4个有效车次的席别。
- 查询日期按今天起15天范围校验，站点名称需能匹配；具体预售和余票以12306为准。
- 成功查询短时缓存60秒，失败短时缓存10秒；访问受限时明确提示，不补造票价。

同一次页面查询中，飞机和火车各自完成加载，较快的一方先出现。两个结果栏的报价条数不是全线路总库存，也不意味着不同报价具有完全相同的税费、行李和退改条件。

## 9 构建与测试

### 9.1 前端检查

在 `frontend` 目录执行：

```powershell
pnpm lint
pnpm format:check
node --experimental-strip-types --test tests/*.test.mjs
pnpm exec tsc --noEmit
pnpm build
```

`pnpm build` 会检查 `NEXT_PUBLIC_AMAP_KEY`；空值会阻止生产构建。用于编译的占位字符串不代表可以完成真实地图验收。

可选的组件开发与检查：

```powershell
pnpm storybook
pnpm build-storybook
```

`pnpm start` 用于运行已完成构建的前端。当前 `/api/*` rewrite 仅用于开发环境；完整生产部署还需自行配置同域 API 代理等服务配置，不能仅凭前端构建成功判断全部功能已可部署。

### 9.2 后端检查与 JAR 构建

在 Windows 项目根目录执行以下命令，可复用与 BAT 相同的环境准备逻辑；生成的环境变量只对当前终端生效：

```powershell
. .\scripts\backend-environment.ps1
$runtime = Initialize-BackendEnvironment -Repository $PWD.Path
& $runtime.MavenCommand -f .\backend\pom.xml --batch-mode test
& $runtime.MavenCommand -f .\backend\pom.xml --batch-mode package
```

成功后 JAR 位于 `backend/target/backend-0.0.1-SNAPSHOT.jar`。返回项目根目录后可使用：

```powershell
.\start-backend.bat -UseJar
```

只有已经自行配置 JDK 21时，才可直接在 `backend` 中运行 `mvnw.cmd test`。BAT 安装的 JDK 不会永久写入其他终端的 `JAVA_HOME`。

2026年10月31日开发验收记录包括128项前端测试、22项后端测试，以及8项启动环境回归检查通过；记忆修复另通过既有18项规则检查与3项路由模型模拟检查。具体历史报告在独立 QA 仓库；这些记录不替代新机器上的实际运行和外部服务验收。审核包保留前后端单测源码，不附带截图或报告。

## 10 Linux 与 macOS 本地运行

BAT 自动下载流程只面向 Windows。在 Linux/macOS 上请先自行准备 JDK 21、Node.js 22和 pnpm 11.25.0，再从项目根目录操作。

启动后端的终端：

```bash
cd backend
test -f .env || cp .env.example .env
# 按第6节填写配置后，显式导入当前终端
set -a
. ./.env
set +a
bash ./mvnw spring-boot:run
```

启动前端的另一终端：

```bash
cd frontend
test -f .env.local || cp .env.example .env.local
# 填写与后端一致的 MODEL_CONFIG_SECRET 及所需外部服务配置
pnpm install --frozen-lockfile
pnpm dev
```

Linux 航司查询需另行安装可用的 Chromium 并配置路径，以支持浏览器沙箱的账户运行。本项目不会自动添加关闭浏览器沙箱的参数。

## 11 常见问题

### 双击 BAT 后提示缺少文件

请使用“全部解压”，保留 `backend`、`frontend`、`scripts` 与 BAT 的相对位置。不要只复制 BAT，也不要直接在压缩软件内运行。

### 下载环境失败或进度暂时不动

查看错误发生在元数据请求、工具下载、校验还是 Maven 依赖解析。检查网络、代理及目标官方站点可访问性，然后重新运行。已经安装好的匹配环境会复用；不要通过关闭校验来继续启动。工具下载完成后，Maven 还需要下载项目依赖，输出形式与工具进度条不同。

### 本机已有 Java，为什么仍下载

项目需要的是匹配架构的 JDK 21，不是任意 Java 或单独 JRE。Java 主版本不同、缺少编译器、可执行文件不可用，或使用了 `-LocalEnvironment`，都会影响复用。启动窗口会打印实际使用的 JDK 路径。

### 已安装 Java，但在另一个终端中仍显示旧版本

启动器只设置本次进程环境，不修改系统 PATH。其他终端仍可能使用原 Java。请通过 BAT 启动，或按第9节在需要测试的终端初始化项目环境。

### 8080端口被占用

先检查是否已经启动了一份后端。启动器不会终止已有进程；可关闭自己已启动的重复服务，或按第6.3节同步修改后端端口与前端代理。

### 访问8080没有产品页面

8080是后端端口。确认健康接口为 UP 后，还需要在另一个终端运行前端，再访问3000端口。

### 前端打不开或提示 pnpm 命令不存在

确认 Node.js 与 pnpm 安装完成，并重新打开终端。进入 `frontend` 后先运行 `pnpm install --frozen-lockfile`，再运行 `pnpm dev`。若 PowerShell 阻止 `pnpm.ps1`，可直接调用 `pnpm.cmd`，例如 `pnpm.cmd dev`。

### 地图空白或构建提示地图 Key 为空

检查 `frontend/.env.local` 的高德 Key、JSAPI 安全配置及当前访问域名授权，然后重启前端。模型 Key 不能替代地图 Key；虚构占位值不能用于真实地图展示。

### AI 提示模型未配置、调用失败或只返回规则方案

检查账户模型设置、服务地址、模型名称、Key 权限、余额和网络。核对前后端 `MODEL_CONFIG_SECRET` 一致，并确认配置位于实际负责调用的进程。搜索服务密钥不能替代模型服务密钥。

### 飞机没有票价，但火车有结果

先检查 `AIRLINE_BROWSER_ENABLED=1`、浏览器路径与启动权限，再检查查询航线是否在当前覆盖范围、官网是否允许访问。两类查询相互独立；没有有效票价时不会强行补充结果。

### 火车没有结果

检查日期是否在支持的预售范围、城市或车站名是否准确，以及12306是否可访问。无有效票价、站点未匹配和访问限制均可能导致空结果；请根据界面提示到官方渠道核实。

### 重启后账户与记录消失

默认 H2 在内存中运行，这是本地开发配置的预期行为。持久化运行需要自行配置数据库；本地数据与线上账户数据库并不相同。

### 不能登录管理员

检查后端是否配置了非空的管理员初始化信息，并使用 `/admin/login`。审核包不附带生产管理员密码或可直接复用的预置生产账户。

## 12 数据边界与审核包说明

- 天气和空气质量是外部预报与网格数据，不是每个地点的地面实测；空气质量标示使用 US AQI。
- 全国环境颜色基于省级代表地点采样与插值，不代表每个地点的实际值或省域平均值。
- 风险评分是应用规则指标，不是官方预警、医疗结论或出行安全保证。
- 攻略摘要受检索收录范围与时效影响，不等于已逐篇核实全文；营业、预约与价格需出发前复核。
- 地图行程连线表示站点顺序，不等于道路导航或实时路况。
- 工具读取公开信息，不提供订票、支付、出票，不绕过登录、验证码或访问控制。
- 审核包只包含源码、必要配置模板、页面实际资源、启动代码及本 README。两张 WebP 图片是前端页面使用的资源，不是测试截图或作品附件。
- 不包含部署资料、独立 QA 仓库、Word/PDF、测试报告、截图、数据库、真实密钥、已安装的 JDK/Maven、依赖缓存或构建产物。
- 完整开发历史、扩展技术资料与测试报告请访问本文开头的两个公开仓库。第三方依赖、素材与数据服务按各自许可证和平台条款使用；公开托管不代表另行授予第三方内容使用权。
