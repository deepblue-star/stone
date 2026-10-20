# Stone 开发说明

## 当前目录

- `miniprogram/`：微信原生小程序。保留开发者工具原模板，新增开发联通页与公共 API 层。
- `admin-web/`：Vue 3 + Vite 管理端；使用 hash 路由和 CloudBase 平台登录。
- `cloudfunctions/business-api/`：事件云函数，构建后生成 index.js。
- `packages/backend/`：领域服务、DAO、连接池和 UnitOfWork。
- `packages/contracts/`：响应、身份、JSON 类型和两端请求边界。
- `database/migrations/`：带版本的数据库结构 SQL。
- `docs/progress/foundation.md`：实际步骤和验证状态；未验证项不能视为已完成。

## 首次启动

1. 安装 Node.js 24 LTS、Git、微信开发者工具，以及 CloudBase CLI 3.8.6。
2. 拉取仓库后切换到 `feat/foundation`，执行 `npm ci`。
3. 从 `.env.example` 建立本机 `.env`。数据库凭据只在服务端使用，不放在 VITE_ 前缀变量中。
4. 管理端的公开配置放 `.env.local`：VITE_CLOUDBASE_ENV_ID 和 VITE_PUBLISHABLE_KEY。publishable key 用于 SDK 初始化，不代表已登录或已获管理员权限。
5. 执行 `npm run typecheck`、`npm run test:unit`、`npm run build`。
6. 微信开发者工具打开仓库根目录，project.config.json 指向 miniprogram/；先 build 再打开，确保公共 client.js 已生成。
7. 执行 `npm run dev:admin`，浏览器访问 http://127.0.0.1:5173/。

开发环境固定为 `stone-d3gga4t2g2ffaedb6`，地域 ap-shanghai；小程序 AppID 为 `wx1b4b5273e28a6c7e`。本机 Node 与云函数 Node 运行时分开管理，云函数构建目标为 Node 18。

当前管理端开发预览：https://stone-admin-dev-stone-d3gga4t2g2ffaedb6.webapps.tcloudbase.com/ 。体验套餐不支持新增本地安全域名，不能把本机页面能打开等同于真实登录可用。首次部署使用独立静态产物目录执行 tcb app deploy，未上传整个代码仓库或任何 .env 文件。

## 数据库

`npm run db:migrate` 使用已登录 CloudBase CLI 的管理通道执行版本化 DDL。执行前验证实际数据库名；已有表无对应历史时拒绝接管。SQL 以 argv 传入 CLI，不拼接为 shell 命令。

当前迁移仅初始化 20 张业务表。另建 `_schema_migrations` 保存文件名、SHA-256、APPLYING/APPLIED 状态与时间，不计入业务表数。MySQL DDL 不能按多表事务回滚；发现 APPLYING 中断记录必须核对实际结构后处理，工具不会自动删表重建。

`npm run db:verify` 读取真实 information_schema，比对列、类型、非空、无符号、自增、字段注释、索引及 CHECK 名称。

`npm run db:seed:dev` 只建立空的公开配置：Banner 空数组、客服 null、入口空数组。不会覆盖已有商家配置，不生成虚构商品或订单。

应用运行使用 mysql2/promise 原生连接，UnitOfWork 在一条连接上执行 begin、DAO 操作、commit 或 rollback。回滚失败会销毁连接，不把不确定事务放回连接池；正常路径才释放连接。

数据库是 VPC 内网地址。Windows 本机不能仅凭填写 .env 就直连内网，不能为了测试随意开放公网。实际连接与多表事务应在已接入同 VPC 的云函数或受控开发主机验证。

## 开发部署

`npm run deploy:dev` 会先构建，再从 `.env` 读取 MYSQL_*，生成 Git 忽略的临时部署配置，向目标环境部署 business-api。命令结束后删除临时凭据配置；不打印密码。实际 VPC/subnet 已依据数据库实例查询结果写入 cloudbaserc.json。

部署缺少凭据时会立即失败，不以 Mock 或匿名放权代替。当前不部署支付入口或定时任务，不上传体验版、不发布正式版。

配置更新需要保留已有环境变量；本脚本当前面向首次基础函数部署。之后给函数增加其他变量时，应先合并进配置，不直接覆盖现有配置。

## 接口与身份

基础底座最初实现 `getPublicSiteConfig` 和 `getSiteConfig`。商品目录模块的本地代码已增加 16 个目录/库存 action：管理员分类、商品、SKU 查询保存和逻辑删除、SKU 下架影响预览、库存调整及流水，用户端标准分类、商品列表、详情与 DIY 材料读取。仅注册实际已实现 action，不返回虚假的成功。

商品目录模块当前仍待开发环境部署确认及真实联调，线上商家端预览暂未更新。不要把本地代码已实现视为线上已发布；最新状态见 docs/progress/catalog.md。

管理端目录路由为 `#/catalog`，基础联通页仍为 `#/`。小程序从 `pages/catalog/index` 展示标准商品，`pages/product/index` 展示规格详情，`pages/materials/index` 是只读材料目录，`pages/foundation/index` 保留联通检查。当前商品阶段没有购物车、支付或 DIY 画布，不模拟其成功结果。

私有商品图由管理端 SDK 上传至 `catalog/`，存储仍为 PRIVATE。目录查询仅对本次数据库返回的图片生成 `image_urls` 临时地址，不签任意客户端文件。技术方案 4.7.5 固定此约定；图片文件引用不保存临时地址。样例图片与提示词见 assets/samples/README.md，均为虚构开发素材。

小程序通过 wx.cloud.callFunction 调用，公共客户端读取 res.result；Web 使用 CloudBase SDK callFunction。两端统一处理业务失败、平台调用失败、请求标识和请求期间禁用。

小程序 OpenID 和 Web UID 只读取可信平台上下文；前端 payload 中的身份字段无效。管理端路由使用 auth.getSession() 检查实际会话，并由后端再次校验 admin_allowlist；仅隐藏菜单不是权限控制。

管理端使用用户名/密码登录，账号由平台管理员建立。数据库账号 `zhanghaozheng` 与管理端登录账号是两种身份，不能混用。管理端应用管理员的 auth_uid 需要人工确认后加入白名单；项目不会自动把当前微信用户提升为商家管理员。

## 验证命令与边界

- `npm run typecheck`：后端与 Vue 严格类型检查。
- `npm run test:unit`：协议、权限、配置过滤、SQL 分句、连接池和事务异常路径。
- `npm run test:integration`：真实线上表结构检查；原生多表事务测试仅当 STONE_RUN_DB_TESTS=1 且所在机器可访问 VPC 时运行。
- `npm run db:verify`：实际结构与建表 SQL 比对。
- `npm run build`：管理端与云函数共享代码打包。

真实云端事务的测试源码在 tests/cloud/transaction-check.ts。开发者可运行 `npx tsx scripts/verify-cloud-transactions.ts`：创建令牌保护的临时验证函数并输出经过断言的结果；结束后应使用明确名称 foundation-db-check 和目标环境进行 dry-run，再删除临时函数。它不是业务接口，不应长期保留。

事务测试有明确 fixture 前缀，清理条件只指向该轮测试创建的数据。跳过的真实事务测试会在报告中显示 skipped，不计为通过。

基础底座商家账号登录已由用户确认，小程序模拟器联通已实际验证；新目录模块仍需单独完成真实浏览器/云端操作和模拟器验收。真机与第二位开发者电脑启动仍待实际操作，不能以组件测试或触发编译代替。

## 当前依赖限制

首次 npm audit 检出官方 CloudBase SDK 的传递依赖告警，包括 lodash.set、lodash.unset 和旧 axios 链。未使用 npm audit fix --force，因为其建议涉及 SDK 跨版本降级。相关风险需要在依赖修复或上线审查中继续处理；构建通过不等于依赖审计通过。
