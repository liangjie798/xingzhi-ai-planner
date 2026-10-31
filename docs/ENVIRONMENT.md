# 环境配置与运行说明

## 三份配置模板

| 模式 | 复制方式 | 加载方式 |
| --- | --- | --- |
| 前端开发 | `frontend/.env.example` → `frontend/.env.local` | Next.js 自动加载；修改后重启开发服务 |
| 后端开发 | `backend/.env.example` → `backend/.env` | 通过 shell 导入环境变量后启动；Spring Boot 不自动加载 `.env` |
| Docker Compose | 根目录 `.env.example` → `.env` | Compose 插值并传入指定容器；不能仅填写前端本地文件 |

安装版本：Node.js 22、pnpm 11、JDK 21。Maven 版本由 `backend/.mvn/wrapper/maven-wrapper.properties` 锁定，前端精确依赖见 `frontend/pnpm-lock.yaml`。生产数据库 MySQL 8.4；本地默认内存 H2。

## 地图与地点

| 变量 | 使用位置 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_AMAP_KEY` | 前端构建时 | 高德 Web JSAPI Key，生产构建必填；设置域名白名单 |
| `NEXT_PUBLIC_AMAP_SECURITY_CODE` | 前端构建时 | 高德 JSAPI 安全码；与代理方案二选一 |
| `NEXT_PUBLIC_AMAP_SERVICE_HOST` | 前端构建时 | 高德安全代理地址；需要自行配置相应代理服务 |
| `AMAP_WEB_SERVICE_KEY` | 前端服务器运行时 | 可选高德 REST Key；用于地点搜索和地址信息，未设置时沿用 JSAPI Key |

`NEXT_PUBLIC_` 变量会进入浏览器包，不可用来存放百度搜索或模型密钥。修改构建变量需要重新构建。无高德配置时只能运行不依赖底图的部分功能，不能视为地图验证成功。

## 后端连接、会话与管理员

| 变量 | 说明 |
| --- | --- |
| `BACKEND_INTERNAL_URL` | Next.js 服务端访问 Java 后端；本地 `http://127.0.0.1:8080`，Compose 为 `http://backend:8080` |
| `NEXT_PUBLIC_API_BASE_URL` | 浏览器 API 地址；使用项目自带代理时留空 |
| `MODEL_CONFIG_SECRET` | 前后端必须完全一致的内部模型解析密钥；生产时生成长随机值，不能沿用模板占位值或开发默认值 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_DISPLAY_NAME` | 管理员初始化；密码空值时不会创建账户 |
| `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD` / `SUPER_ADMIN_DISPLAY_NAME` | 可选超级管理员；启动时按配置更新其管理访问权限 |
| `SESSION_COOKIE_SECURE` | 本地 HTTP 为 `false`；公网 HTTPS 应设为 `true` |
| `FRONTEND_ORIGIN` | 允许的前端来源；本地 `http://localhost:3000`，生产填写自己的 HTTPS 域名 |
| `SERVER_PORT` | 后端端口，默认 `8080` |

前后端通过 HttpOnly 会话 Cookie 关联账户。普通用户和访客入口为 `/login`，管理员独立入口为 `/admin/login`，登录成功进入 `/admin`。后端同时校验账户角色与登录入口，页面分开不替代服务端授权。登录不自动创建管理员；请设置环境变量后启动后端。不要在公开 README 中写入生产账户密码。

管理员和超级管理员可读写 `/api/v1/admin/**`：管理普通用户、处理反馈及查看统计。写操作验证 CSRF，管理员账户不能通过普通用户管理修改或删除，停用/删除立即终止该普通用户后续请求。删除用户会连同其规划、搜索、反馈及账户记忆一并删除。Next.js Proxy 将管理会话从 `/XingZhi`、`/hourly`、`/settings`、`/account` 返回 `/admin`，Java SecurityFilterChain 继续阻止管理身份调用用户业务工具。用户对话记忆保存在 `app_user.conversation_memory`，访客与未登录会话保存在服务端 HttpSession；退出后访客记忆失效。新增 `user_feedback` 表由生产 `ddl-auto:update` 创建，部署前应备份数据库。

## 模型服务

账户设置页保存的模型配置优先用于前端路线编排和文字生成，密钥保存在服务端；也可通过前端服务器环境配置默认模型：

| 变量 | 说明 |
| --- | --- |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | DeepSeek 默认模型，模型名默认 `deepseek-chat`；后端 Agent 也使用这组变量 |
| `SILICONFLOW_API_KEY` / `SILICONFLOW_MODEL` | 可选硅基流动模型，用于前端服务器模型调用 |
| `DEEPSEEK_BASE_URL` | Java 后端 DeepSeek 服务基址，默认官方地址 |

未配置模型、密钥权限错误、限流、超时及无效返回会显示实际原因，不会将规则生成标成模型生成。旅游编排开启 JSON 输出并校验候选地点。后端 Agent 与前端编排是两条执行路径，应分别查看轨迹，不保证同一个模型名称在不同服务商都有权限。

## 百度联网搜索

```dotenv
WEB_SEARCH_PROVIDER=baidu
BAIDU_SEARCH_API_KEY=填写有搜索权限的百度千帆API密钥
```

这两项是前端**服务器运行时**变量。百度搜索密钥不能替代 DeepSeek 等大模型密钥。账号需开通对应搜索服务，费用和额度以供应商控制台为准。小红书、抖音结果仅为搜索引擎收录内容，不保证覆盖全站或实时排名。

可选替代：`WEB_SEARCH_PROVIDER=tavily` 配合 `TAVILY_API_KEY`。已有授权数据服务可配置 `SOCIAL_RESEARCH_ENDPOINT`（HTTPS）和可选 `SOCIAL_RESEARCH_TOKEN`。详见 [联网搜索接入](social-research.md)。

## 数据库与生产部署

| 变量 | 说明 |
| --- | --- |
| `SPRING_PROFILES_ACTIVE` | 本地默认配置使用 H2；生产为 `prod` |
| `DATABASE_URL` / `DATABASE_USERNAME` / `DATABASE_PASSWORD` | 生产 JDBC 连接参数；Compose 自动传入内部 MySQL 地址 |
| `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` | Compose 数据库初始化密码，必须替换模板值 |
| `HTTP_PORT` | Compose Nginx 对外 HTTP 端口，默认 `80` |

本地 H2 重启后清空账户与记录；生产使用 MySQL 持久卷。不要通过删除数据卷修复启动问题，以免清空注册及决策数据。

当前演示服务采用 systemd。私有配置在 `/etc/shihou/`；该目录不在仓库内。部署脚本中保留了演示站域名和路径示例，新部署应修改为自己的域名。小内存实例应在 CI 或开发机完成依赖安装、镜像构建后再部署，避免与运行中的服务争用资源。

## 常见问题

- **构建报高德 Key 为空**：在构建环境设置 `NEXT_PUBLIC_AMAP_KEY`。CI 占位值只能验证编译，不能用于真实地图。
- **登录后模型配置没有生效**：检查 Cookie、`BACKEND_INTERNAL_URL` 和前后端一致的 `MODEL_CONFIG_SECRET`；模型配置绑定当前用户，不自动共享给访客。
- **百度搜索提示未配置**：确认变量传给前端服务器，而非仅传给 Java 后端；修改后重启前端。
- **地图默认显示全国**：这是预期行为。在对话中确认城市后展示当地地图；重置规划回到全国。
- **数据缺失或连接失败**：检查对外访问 Open-Meteo、高德、DataV 和搜索服务的网络。系统不使用虚构数值填补缺测。
- **模型轨迹提示规则兜底**：查看具体原因，校验模型地址、权限和账户绑定；这与百度搜索是否成功是两件事。
