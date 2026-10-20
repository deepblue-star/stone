# 基础开发底座实施记录

开始日期：2026-10-21（北京时间）

## 目标与依据

- 执行计划：[2026-10-21-foundation.md](../superpowers/plans/2026-10-21-foundation.md)。
- 技术方案：https://lcniux4u23kj.feishu.cn/wiki/DMlxwlG6BinXJGklQG6cyNKmnad。
- 本地仓库：`D:/CodexWorkspace/stone`。
- 远程仓库：`https://github.com/deepblue-star/stone.git`。
- 工作分支：`feat/foundation`。
- 小程序 AppID：`wx1b4b5273e28a6c7e`。
- 目标开发环境：`stone-d3gga4t2g2ffaedb6`。

## 状态总览

| 任务 | 状态 | 验收证据或未完成原因 |
|---|---|---|
| 账号、AppID、环境关联 | 已验证 | 微信开发者工具查询已返回目标环境 |
| Git 仓库和实施分支 | 已完成 | 仓库已克隆；在原目录创建 feat/foundation，保留现有文件 |
| 最新技术方案核对 | 已完成 | 恢复只读授权，读取线上 revision 844；第三、四章、架构、首页和管理端已保存 docs/reference/ |
| 项目结构与公共命令 | 已验证 | 目录、依赖锁、TypeScript、构建、API、环境模板和 Git 忽略已建立；干净目录 npm ci 成功 |
| 云函数原生 MySQL 连接 | 已验证 | business-api 云端查询成功；临时云端验证器完成真实多表事务 |
| 20 张业务表与变更脚本 | 已验证 | 20 表结构核对通过；重复迁移 SKIP；另有 1 张迁移基础设施表 |
| business-api 与统一协议 | 已实现并部署 | 仅开放 getPublicSiteConfig 和 getSiteConfig；协议、身份与日志测试通过 |
| 小程序与管理端公共层 | 已实现，部分运行验收待完成 | 小程序编译已触发，模拟器自动化超时；管理端登录页和失败态已在浏览器验证 |
| 自动测试与真实云端验证 | 已执行 | 68 项单测；真实结构检查；云端事务 8 项检查通过，详见下方证据 |
| 真机与第二台电脑 | 未验证 | 需要人工扫码和第二位开发者实际运行 |

## 操作流水

### 001 — 接收实施授权与检查工作区

- 用户授权：开始建表和基础框架开发，并要求每步进度记录为本地 Markdown。
- 读取实施计划、执行流程、Git 工作区和测试要求。
- 起始分支为 main；当前目录不是 Git worktree，也不是子模块。
- 为保持开发者工具已有项目路径不变，在原目录建立 `feat/foundation` 分支；未另建工作区。
- 现有变化包括用户创建的 app/pages/components/utils 等模板文件，以及 README.md 删除状态。全部保留，未执行 reset、checkout 恢复或批量删除。
- 原项目没有 package.json 和测试脚本；当前无可运行的项目基线测试，不能记录为测试通过。
- 这一步未改业务代码、未建表、未部署云函数、未推送远程仓库。

### 002 — 飞书授权前置项

- 之前的技术方案读取返回 `authentication/token_missing`。
- 已读取飞书用户授权说明；所需范围限定为 `docx:document:readonly`。
- 采用设备授权流程，请用户确认后继续；授权链接和设备码不写入仓库。
- 需要用户完成授权后，由 agent 执行设备码完成登录，再读取线上方案。
- 数据库 DDL 在本项完成之前不执行；不将缓存 revision 841 视为最新方案。

## 记录规则

每次实质变更追加：任务、涉及文件、操作目的、运行命令、实际结果、剩余问题。涉及测试时记录失败原因及修复后的结果。涉及云操作时记录目标环境和非敏感请求标识。

不得记录密码、API Key、access token、设备授权码、完整身份证明或真实用户隐私。授权二维码保存在仓库外；测试数据与真实数据明确区分。

任务仅在实际验证通过后改为已完成。外部登录、人工授权或第二台电脑尚未完成时，明确保留未验证状态。

### 003 — 恢复授权并冻结线上方案

- 用户确认授权后完成设备登录，仅获取 docx:document:readonly。
- 线上技术方案版本为 844；读取并保存 schema.xml、backend.xml、architecture.xml、site.xml、admin.xml 到 docs/reference/。
- 从第三章提取 20 条原始 CREATE TABLE 到 database/migrations/001_initial_schema.sql；不新增外键，不恢复已删除设计。
- site_config 使用 config_key 主键，这是方案明确的例外；未擅自添加自增 ID。

### 004 — 建表脚本、首批测试与执行

- 创建 SQL 分句器测试：引号内分号、注释、未闭合字符串、20 表提取；首次运行因实现不存在失败，补实现后 3 项测试通过。
- 建立管理通道 SQL 执行器，SQL 作为 argv 传递，不拼接到 shell 代码中。Windows PowerShell 子进程包装出现挂起，确认尚未写库后停止本次进程，改为 Node 直接执行已安装 CLI 的 JS 入口。
- 运行 npm run db:migrate；全部 20 张业务表创建成功，001_initial_schema.sql 标记 APPLIED。
- MySQL 的 DDL 不支持跨表整体回滚；迁移开始时记 APPLYING，只有全部建表核对成功才记 APPLIED。中断版本不会自动覆盖或盲目重跑。
- _schema_migrations 是第 21 张基础设施表，具有 id、created_at、updated_at、is_deleted；20 张业务表保持技术方案定义。
- 当前只通过管理通道建表；为避免凭据缺失阻塞无关工作，实际云函数连接与真实事务验收继续单独推进，不假定已通过。

### 005 — 运行时前置核查

- 已核对 MySQL 内网端点、真实 VPC/subnet 和目标地域；没有猜测资源 ID，没有开通公网数据库访问。
- 应用登录配置查询确认 UserNameLogin=true、AnonymousLogin=false。
- 原生 mysql2 连接遵循用户已批准的 UnitOfWork 方案；通用 skill 的 SDK 优先规则不替代该项目已确认的同连接事务架构。
- 已请求用户把业务数据库账号填写到仓库忽略的 .env，而不是发送密码到聊天；凭据齐备后才验证真实云端连接。
- npm 初次依赖审计发现 CloudBase 官方 SDK 的传递依赖告警；继续核实补丁和可兼容修复，不进行自动破坏性降级。

### 006 — 后端实现与独立审查

- 使用独立实现子 agent 完成契约、薄 Handler、SiteConfigService、AdminAccessService、DAO、mysql2 连接池和 UnitOfWork。
- 首批实现 53 项测试通过；独立规格审查通过，质量审查发现回滚失败后释放连接会污染连接池。
- 补回归测试，改为 rollback 失败时 destroy，release 失败时也尽力销毁，保留原始错误；独立复审通过，后端测试增至 60 项。
- 两端请求边界另有 3 项测试，SQL 分句器另有 3 项测试，合计 66 项。
- TypeScript 7 与当前 vue-tsc 不兼容；固定 TypeScript 5.9.3、Node 24 类型后完成严格类型检查，未用 any 或 ts-ignore 压制。

### 007 — 两端框架与原模板迁移

- 将现有 app/pages/components/utils 等模板原样移动到 miniprogram/，保持根目录作为开发者工具项目入口；未恢复用户删除的 README。
- 增加开发联通页、真实 wx.cloud API 层、共同的响应解包和请求中禁用逻辑。
- 管理端采用 Vue 3 + Vite + hash 路由；平台用户名密码登录，getSession 检查会话，后端检查管理员白名单；没有自动创建商家管理员。
- 建立空公开配置 3 项，使用不存在时插入的方式，不覆盖已有配置。
- 浏览器从 / 自动跳到 #/login；不存在账号提交后出现安全错误提示，请求中禁用，完成后按钮恢复。
- 管理端 SDK 打包约 941 kB（gzip 约 246 kB），构建保留体积告警；未调高阈值来掩盖。

### 008 — 数据库凭据与真实部署

- 用户在控制台建立数据库账号 zhanghaozheng，并在本机 .env 填写口令；仅检查配置是否齐全，没有输出密码。
- .env、.env.local、project.private.config.json、.local/ 均经 git check-ignore 验证不会入库。
- business-api 以 Nodejs18.15 Event 函数部署到既定环境，实际 VPC/subnet 来自实例查询。
- 第一次 CLI 部署失败原因为 functionRoot 绝对路径被 CLI 再拼接 cwd；改为相对路径后成功。临时部署配置结束后删除。
- 公开配置实际请求成功：request_id=090ee7fb-bf91-4634-8a71-3ca40e1532d0；返回空 Banner、客服 null、入口空数组。
- 无会话管理请求返回 UNAUTHORIZED：request_id=f0e4df89-159c-449e-b677-64516b771e1a。
- 未知 action 返回 INVALID_ARGUMENT：request_id=52db2792-f55a-4f21-ac03-3f5afd790d48。

### 009 — 真实云端事务与清理

- 临时私有验证函数 foundation-db-check 使用随机一次性令牌，不注册为业务 action，不公开凭据。
- 首次真实提交和回滚通过；连接复用断言因 SELECT 1 在 BIGINT 字符串模式下返回字符串而失败。改为明确数值比较后通过，没有修改业务金额或 ID 类型约定。
- 独立规格审查补出验证器应使 ok:false 返回非零退出码、异常分支应清理购物车测试数据；均已修正。
- 补测积分流水 event_key 重复、订单金额不符合公式的实际拒绝路径。
- 最终请求 d9b3fbaa-d58b-49ec-9ba0-e02fd34b45fb：commit、rollback、connectionReuse、cartUnique、quantityCheck、eventUnique、moneyCheck、cleaned 全部 true。
- 云端验证结束后 dry-run 核对名称和环境，再删除本轮创建的临时验证函数。当前只保留 business-api。
- 二次只读核查：foundation_test_ 前缀的积分账户 0 条、积分流水 0 条。
- 重复 SKU 规格依赖后续 AdminCatalogService 的规范化与加锁校验；DDL 的 idx_sku_spec 本来不是唯一索引，本轮没有篡改为唯一。

### 010 — 时区与平台套餐边界

- 实测管理通道 MySQL session 为 +08:00；应用 mysql2 连接每次 checkout 已设置 +00:00。
- 管理脚本改为显式 UTC_TIMESTAMP 写迁移历史和种子时间；将本轮生成且尚未被用户编辑的 1 条迁移历史、3 条空公开配置的初始时间修正到 UTC。
- 体验套餐添加本地安全域名被平台拒绝（CreateAuthDomain：当前套餐无法执行此操作）。未升级套餐、未开放匿名登录、未放宽函数或数据库权限。
- 使用已有平台授权的托管域名部署静态管理端开发预览；只上传构建产物，不上传 .env 或服务端配置。
- 服务 stone-admin-dev，版本 stone-admin-dev-001，buildId=2609050007。
- 地址：https://stone-admin-dev-stone-d3gga4t2g2ffaedb6.webapps.tcloudbase.com/。

### 011 — 小程序模拟器验收限制

- 开发者工具 check_wechatide_status 返回已登录、skill 版本一致。
- simulator_open_page 已成功触发 pages/foundation/index；console error 过滤无命中，但这不证明完整运行成功。
- automation_runtime_info 和 simulator_screenshot 连续出现 automator 连接超时。重载工程后仍未恢复，因此停止同一路径重试，保留该项未验证。
- 没有以“触发编译成功”代替“小程序真实调用成功”；真机与第二台电脑仍需人工验收。

### 012 — 最终复审与管理端更新

- 扩展规格审查再次通过；质量审查补出 signOut 可能以 resolved error 返回的问题。增加 2 项回归测试并处理该分支；验证器补齐 MYSQL_SSL 转发。
- 最终独立质量复审通过：68 项单测、后端和 Vue 类型检查通过，无剩余代码阻断问题。
- 管理端更新为 stone-admin-dev-002，buildId=2609050160，同一开发预览 URL；未上传项目源目录或任何服务端凭据。
- 预览 URL 的 HTTP 200 与 HTML 标题已验证；云端浏览器自动化读取超时，仍不宣称有效管理员登录成功。
- 增加 GitHub Actions：npm ci、typecheck、test:unit、build；实际远程执行结果须在推送后另行查看，当前不冒充已通过。
- 在单独的干净临时目录仅复制 package.json/package-lock.json 后执行 npm ci，229 个包安装成功；与现有开发服务器的 node_modules 分离，未把本机缓存状态当成首次安装证明。
- 云函数自身另外生成依赖锁文件，固定直接依赖和传递依赖版本，随部署包保留。

### 013 — 提交前复核（北京时间 2026-10-21）

- 重新执行 npm run typecheck、npm run test:unit、npm run build：全部退出码 0，68 项单测通过；保留 Web SDK 大包告警。
- 重新执行 npm run db:verify：20 张业务表结构核验通过。npm run test:integration：1 项通过、2 项本机内网事务测试跳过，未将跳过算通过。
- 仅清除原小程序模板的两处行尾空格，未改模板逻辑；更新实施计划勾选，未完成的客户端/人工验收继续保留。
- 本轮提交只包含基础底座文件；用户原有根 README.md 删除保持未暂存，不恢复也不纳入提交。
- 准备核验暂存区空白、隐私文件和实际密钥，再提交到 feat/foundation；远程结果在下一条记录确认。
