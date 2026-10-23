# 联网搜索与策划资料

默认使用百度千帆搜索 API，并行检索全网攻略、小红书收录内容、抖音收录内容。搜索摘要直接用于候选地点匹配及模型规划参考，不会将搜索引擎排名当作平台热榜。用户也可以在对话中粘贴 HTTPS 笔记或视频链接，系统尝试解析该公开页面。

## 配置百度搜索

1. 在百度智能云千帆开通 AI 搜索服务，创建有搜索权限的 AppBuilder API Key。搜索密钥与用户的大模型密钥分开管理。
2. 本地在 `frontend/.env.local` 配置以下服务端变量；当前线上配置文件为 `/etc/shihou/web-search.env`（权限 600），填写后执行 `systemctl restart shihou-frontend` 生效。对应 systemd 配置为 `/etc/systemd/system/shihou-frontend.service.d/web-search.conf`。不要提交密钥或使用 `NEXT_PUBLIC_` 前缀。

```dotenv
WEB_SEARCH_PROVIDER=baidu
BAIDU_SEARCH_API_KEY=你的搜索密钥
```

接口固定为 `POST https://qianfan.baidubce.com/v2/ai_search/web_search`，使用 Bearer 认证、`baidu_search_v2`、网页模式。每次新查询至多发起 3 次请求，每次最多请求 6 条结果，最终去重保留 8 条。相同城市和活动在同一服务进程缓存 10 分钟，超时 6.5 秒；搜索失败不缓存。城市和活动作为关键词发送给百度，不发送用户密码、会话或模型密钥。

未配置密钥、鉴权失败、限流、超时、结果为空均会在 Agent 轨迹及规划书中显示。没有搜索资料时继续使用天气、POI 与场景规则。搜索摘要未验证全文；检索时间、网页标注日期分别展示。不会尝试绕过平台登录或验证码。

百度文档：https://ai.baidu.com/ai-doc/AppBuilder/pmaxd1hvy

### 可选 Tavily

保留替代服务支持：设置 `WEB_SEARCH_PROVIDER=tavily` 和 `TAVILY_API_KEY`。请求固定为 `https://api.tavily.com/search`，使用同样的来源过滤与结果结构；不会在百度失败时自动产生额外付费调用。

只保留有标题、原文链接且匹配目的地的网页摘要。社交平台的搜索入口、登录页、验证页不会计入；失败原因显示在 Agent 轨迹和规划书中，不编造点赞数或热榜排名。

旅游候选地点按采集内容中的名称匹配排序，随后模型结合引用内容、已核对 POI 与天气编排路线。无法获取平台内容时继续使用真实环境数据和 POI。

## 可选授权数据服务

用户取得数据服务授权后，可在服务端环境配置：

- `SOCIAL_RESEARCH_ENDPOINT`：可信服务的 HTTPS POST 地址。
- `SOCIAL_RESEARCH_TOKEN`：可选 Bearer Token，仅在服务器保存。

请求格式：`{"city":"西安市","activity":"旅游景点 美食","limit":8}`。

响应格式：`{"items":[{"title":"帖子标题","excerpt":"已授权获取的摘要","url":"https://www.xiaohongshu.com/explore/帖子ID"}]}`。

接口返回的链接仍需为两平台的实际帖子地址。服务端会记录采集时间并验证 URL。用户提供具体公开链接时仍会尝试读取，不再直接抓取平台搜索页。
