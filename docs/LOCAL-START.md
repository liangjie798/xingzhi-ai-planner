# Windows 本地后端启动

在项目根目录双击 `start-backend.bat`，或在完整交付包根目录双击同名入口。

## 环境与配置

- 安装 JDK 21，推荐设置 `JAVA_HOME`。启动器也会检查 PATH、常见安装目录和项目所在磁盘的 `JavaVersions` 目录，不依赖固定盘符。
- 不需要单独安装 Maven，使用 `backend/mvnw.cmd`。首次运行需要联网下载 Maven 和依赖。
- 默认使用端口8080和内存 H2，无需 MySQL。重启会清空本地记录；它与线上数据库独立。
- 如需配置模型、管理员或其他参数，将 `backend/.env.example` 复制为 `backend/.env` 后填写。启动器按 UTF-8 读取简单的 `KEY=value`，支持成对引号，不执行其中的命令，也不输出密钥。已有进程环境变量优先。
- `MODEL_CONFIG_SECRET` 需与前端配置一致。启动器只启动后端；前端仍需在 `frontend` 中执行 `pnpm install --frozen-lockfile` 和 `pnpm dev`。

## 使用

```bat
rem 默认编译源码并启动
start-backend.bat

rem 使用其他端口，避免与已有服务冲突
start-backend.bat -Port 18080

rem 只检查 JDK、配置和端口，不启动
start-backend.bat -CheckOnly

rem 启动已经构建的 JAR，不重新编译
start-backend.bat -UseJar
```

健康检查：<http://localhost:8080/actuator/health>。返回 `{"status":"UP"}` 表示服务已就绪；控制台启动期间暂时无法连接是正常的。使用 Ctrl+C 停止服务。端口占用时启动器会退出并提示，不会终止其他进程。

自动化调用时可先设置 `set XINGZHI_NO_PAUSE=1`，避免退出时等待按键。现有 `backend/run-dev.ps1` 也会转交同一启动器。

## 目录与打包

`frontend/` 为前端，`backend/` 为后端，`docs/` 为项目材料，`deploy/` 为部署配置，`scripts/` 为启动与打包工具。完整工作区的测试材料保存在独立的 `xingzhi-ai-planner-qa/` 仓库，交付文档保存在同级 `deliverables/`。

运行 `scripts/package-workspace.ps1` 生成可移交的 ZIP 与 SHA-256 校验文件。包中保留当前已纳入 Git 管理的源码及测试材料、交付文档和根目录启动入口，不带 `.git`、依赖缓存、构建缓存、实际环境配置、数据库及历史部署包。解压后从源码启动；JDK 和首次依赖下载仍需自行准备。
