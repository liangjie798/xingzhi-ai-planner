# 适候 · AI 户外活动环境决策平台

面向学校、社区和活动组织者的 Web 决策工具。用户选择城市、时间、活动强度与人群后，系统计算候选时段风险，展示空间图层、执行建议、依据和工具轨迹。

当前版本可搜索中国大陆城市及区县，也可通过浏览器定位当前位置。系统实时读取 Open-Meteo 天气、降雨、体感温度与空气质量预报；候选时段直接使用逐小时数据，US AQI 会在界面明确标注。地图使用城市网格预报生成连续热力色带，并明确标注为插值展示。热风险由体感温度和湿度计算。DeepSeek 密钥存在时增强文字解释，不修改风险计算结果。

工作台区分校园运动会、体育课、社区活动、户外训练、研学活动与旅游规划六种场景。每种场景具有不同的风险权重、执行建议和界面说明；日期范围支持今天至未来四天，多日活动会实际比较范围内每天的逐小时预报。独立逐小时页面展示24小时温度、湿度、降水、US AQI、PM2.5、热风险与活动适宜度。

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
# 终端 1：启动后端，本地默认使用 H2 数据库
cd 'G:\Ai Web\amap-jsapi\backend'
./run-dev.ps1

# 终端 2：启动前端
cd 'G:\Ai Web\amap-jsapi\frontend'
Copy-Item .env.example .env.local
npm ci
npm run dev
```

访问 `http://localhost:3000`。前端开发服务器把 `/api/*` 转发至 `localhost:8080`。未提供高德密钥时，地图区域仅显示真实城市坐标和城市级实时指标，不生成虚构的空间差异。

切换当前 PowerShell 会话的 Java 版本：

```powershell
$env:JAVA_HOME = 'G:\JavaVersions\jdk21.0.12' # 或 G:\JavaVersions\jdk8u152
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
javac -version
```

## 配置与部署

复制根目录 `.env.example` 为 `.env`，填写 MySQL 密码。`DEEPSEEK_API_KEY` 可留空，此时使用确定性规则生成解释。浏览器端高德地图需要 Web 端 JSAPI Key 以及安全密钥或代理地址，对应 `NEXT_PUBLIC_AMAP_SECURITY_CODE` 或 `NEXT_PUBLIC_AMAP_SERVICE_HOST`。前端公开变量会在镜像构建时写入客户端包，请按高德控制台的域名白名单限制 Key。不要提交 `.env`。

```bash
docker compose up -d --build
docker compose ps
```

默认开放 80 端口。生产服务使用 MySQL 8.4；Spring JPA 首次运行创建表。部署到公网前应配置域名、HTTPS 和数据源授权。阿里云服务器需要放行 80/443 端口。

### Ubuntu 服务器原生部署

`deploy/native-setup.sh` 用于无 Docker 的 Ubuntu ECS：安装 Node.js 22、Java 21、MySQL 与 Nginx 后，将仓库文件放在 `/opt/shihou`，把后端 JAR 放在 `/opt/shihou/backend/app.jar`，以 root 执行脚本。脚本会创建独立服务用户、数据库账号、systemd 服务和 Nginx 配置，DeepSeek 密钥可在 `/etc/shihou/backend.env` 中设置。当前阿里云部署使用 `lht574.cn`。

## API

- `GET /api/v1/cities`：九个城市的实时环境快照。
- `GET /api/v1/cities/{cityId}`：单个城市的实时环境快照。
- `GET /api/v1/cities/search?q=`：检索中国大陆城市及区县。
- `GET /api/v1/cities/environment`：按城市坐标读取实时环境。
- `GET /api/v1/cities/hourly`：按城市坐标与日期读取24小时环境预报。
- `POST /api/v1/decisions/analyze`：候选时段计算、依据检索与建议生成。
- `GET /actuator/health`：后端健康检查。

## 数据边界

天气与空气质量是城市坐标附近的网格预报，并非单一地面监测站实测值；系统支持今天至未来四天。当前依据库为内置规则摘录，尚未升级为向量检索。Agent 轨迹来自实际后端步骤，模型只承担解释生成。

团队信息：待参赛团队填写。

