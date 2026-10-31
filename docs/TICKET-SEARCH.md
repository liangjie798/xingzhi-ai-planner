# 航司官网 Agent 工具

已删除原票价服务客户端与密钥配置依赖。现在通过本机/服务器真实浏览器访问公开航司页面，只读取展示报价，不重放私有接口，不登录、不绕过验证码、不创建订单。

## 覆盖与限制

民航局目录65项，人工样例16家曾取得报价；2026年10月31日正式验收启用 **MF厦航、SC山航、RY江西航、GS天津航、9H长安航**。东航等仅本地样例成功但未通过云端验收的适配器不启用；货运、集团实体和没有有效票价的来源不抓取。其余目录条目保留测试状态，不冒充可查询。

每次最多3家，按已确认的出发地、目的地、北京时间日期查询，单程1成人。城市机场映射是明确的有限清单，未知城市不交给模型猜测。部分站点只查询同城某个机场，并未遍历全部机场。查询日期为今天起90天内。

展示价不等于最终含税支付价。舱位售罄、Infinity、条件不一致、来源不明的结果被拒收。价格、余票、行李及退改条件需到官网核实。独立 `/transport` 页面并行查询飞机和火车，各自结束加载；不能以不完整票价声称某种方式绝对更便宜。

火车查询正常读取12306公开初始化页公布的查询路径，在同一匿名会话中获取车次和席别价格，不绕过登录、验证码或访问控制。展示正价格、出发/到达时间及历时；每次最多展示4个有效车次的席别。成功缓存60秒、失败缓存10秒。2026年10月31日样例取得西安至榆林11条席别报价，覆盖与速度仅代表当次线路验收。

## 工具与模型

- `search_domestic_flights`：只读查询，参数 `origin`、`destination`、`date`、可选最多3个 `airlineCodes`。
- `search_domestic_trains`：只读12306查询，参数 `origin`、`destination`、`date`。
- `list_airline_coverage`：目录、历史样例与适配器覆盖。
- `GET /agent-tools`：工具 JSON Schema 与覆盖清单。
- `POST /agent-tools`：`{"name":"search_domestic_flights","arguments":{"origin":"厦门","destination":"北京","date":"YYYY-MM-DD","airlineCodes":["MF"]}}`。

对话使用账户保存的兼容模型进行真实 Function Calling；模型返回的工具名称和参数必须通过服务端检查，不能改变已确认条件。模型不支持工具或调用失败时，按已确认条件执行只读查询，并将 `modelCall.success=false` 与实际工具执行模式分别返回，不冒充模型调用成功。表单查询不依赖模型密钥。

## 运行配置

服务端配置：

```dotenv
AIRLINE_BROWSER_ENABLED=1
# Windows 可留空，自动发现 Microsoft Edge；Linux 指定已安装的 Chromium。
AIRLINE_BROWSER_EXECUTABLE=/usr/bin/chromium
```

Windows 开发环境可使用已安装的 Edge。原生 Linux 部署需安装 Chromium 及其运行依赖，并以支持浏览器沙箱的非 root 账户运行。Docker 镜像包含 Chromium，但默认关闭官网查询；容器宿主必须支持浏览器沙箱，先做真实查询验收再启用。代码没有自动添加 `--no-sandbox`。

不需要新增航司付费 API Key。模型 Function Calling 仍使用用户自己的模型服务及额度。不要给任何浏览器配置代理轮换、登录凭据或验证码破解。

单进程最多1个航空浏览器查询任务、每小时最多30个新查询；同条件成功结果缓存60秒，失败缓存10秒。浏览器空闲30秒关闭，每次浏览器上下文独立清理；航空整体查询等待预算30秒，单航司等待上限10秒，慢来源结束后继续查询后续航司，模型选择另最多10秒。官网明确无航班且日期、线路已核实、连续两次观察稳定时可提前结束等待；不能将未核实页面当作无航班。调用方断开会取消浏览器上下文。多实例部署的限流需由网关统一处理。

## 验证

```powershell
node --experimental-strip-types --test tests/*.test.mjs
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

独立 QA 仓库的 `scripts/smoke-airline-agent.mjs` 用全新匿名浏览器上下文测试适配器，原始页面观察和结构化结果分开保存。该脚本的历史样例日期需在重跑时更新。Function Calling 协议单测使用明确的模拟模型响应；不能将它当成真实账户模型或线上部署验收。

[首轮航司逐家报告与86张截图](https://github.com/liangjie798/xingzhi-ai-planner-qa/tree/main/reports/airlines-20261030)。本地适配器验证不等于云服务器、长期运行、多航线、登录后或支付环节已验证。
