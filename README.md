# 同频脑电波

## 微信小游戏（原生 Canvas）

小游戏账号请使用 `apps/minigame`，不要导入 uni-app 小程序产物。客户端为普通 TypeScript、esbuild 和原生 `wx` Canvas，无 DOM、Vue、uni 或 Node 运行依赖；复用 shared 的类型、inputSync、timeline 和现有 `/ws`，后端规则不复制。昵称、词语、房间码、聊天使用原生键盘；历史及聊天上下滑动，同组只有外框，不显示小组标签和提交勾角标。

```bash
pnpm install --frozen-lockfile
pnpm --filter @word-sync/shared build
cp apps/minigame/config.example.json apps/minigame/config.local.json
# 本地调试：config.local.json 中 mode 改为 local
pnpm --filter @word-sync/server dev
pnpm --filter @word-sync/minigame dev
# 普通构建（默认云配置为空，运行会给出中文提示）
pnpm --filter @word-sync/minigame build
pnpm --filter @word-sync/minigame checkbundle
# 上传前严格构建：必须填真实 AppID、env、service 且 mode=cloud
pnpm --filter @word-sync/minigame build:production
```

开发者工具导入 **`apps/minigame/dist`**，该目录生成 `game.js`、`game.json`、`project.config.json`，`compileType=game`。根目录的项目配置和私有配置不会被覆盖。`config.local.json` 填本人有权限的真实小游戏 `appid`、云环境 `env`、服务 `service`，示例故意全部留空、不编造；本地 `localUrl` 默认 `ws://localhost:3000/ws`，手机不能使用自己的 localhost。上传模式禁止本地配置。不要提交私有配置或令牌。

云托管部署沿用下节单实例及 `/ws` 网关要求，不自动开通、收费、部署或上传。使用真实小游戏账号在开发工具导入产物，检查云连接、Canvas 安全区/DPR、四类键盘、滚动、前后台恢复和相册授权；通过后手动上传，在小游戏管理后台设置体验版、添加体验成员并扫码。工具基础库需支持 `wx.cloud.connectContainer`，环境和服务访问权限需由账号拥有者配置。服务重启清房及清令牌，不能将构建通过当成云部署或真机通过。

恢复令牌仅存 `wx` storage。隐藏立即关闭连接、取消重试及键盘，保留令牌；显示重新连接且等待恢复 ACK 和新的个人定向状态才允许写操作。旧连接/ACK/键盘代次失效，不自动重放结果未知的操作。邀请分享使用小游戏 `query=roomCode=...`，没有小程序 page path 或令牌。纪念图默认仅含全部回合词，明确勾选授权后才加入本人可见日志；生成不自动预览/保存，须用户主动操作，相册取消及拒绝有中文提示。

验证命令：`pnpm test`、`pnpm typecheck`、`pnpm build` 及上述小游戏 build/checkbundle。`node scripts/minigame-runtime-verify.mjs` 将完整 game.js 在模拟 wx Canvas、原生键盘和 SocketTask 中运行，触摸驱动创建、作答、混合对局、个人返房、隐藏恢复和分享；证据 `artifacts/小游戏运行验证.json`。`node scripts/mixed-runtime-verify.mjs` 进一步覆盖三人私密历史、永久合组、候选否决/超时、5 秒推进、跨传输接管与个人视图。模拟 wx 不代表微信真实渲染或设备验收；未提供真实 AppID/env/service，云、体验版和真机未验收。本次实际尝试 CLI 导入，被“工具的服务端口已关闭”阻止；未修改安全设置。未完成微信开发工具内渲染、云连接、体验版上传、真机安全区/键盘/相册验收。

## 微信小程序体验版

网页版保持在 `apps/web`；新增 `apps/miniprogram` 使用 Vue 3.4.21、Pinia、TypeScript 与统一锁定的 DCloud Vue3 工具链，Vite 5.2.8 独立于网页版。首页、大厅、作答、揭晓、结果和历史在同一个原生页面内按服务器个人 `view` 切换，不使用网页路由或 DOM。

### 本地小程序开发

```bash
pnpm install --frozen-lockfile
pnpm --filter @word-sync/shared build
cp apps/miniprogram/.env.example apps/miniprogram/.env.local
pnpm --filter @word-sync/server dev
pnpm --filter @word-sync/miniprogram dev:mp-weixin
# 或生产产物
pnpm --filter @word-sync/miniprogram build:mp-weixin
```

在微信开发者工具导入 `apps/miniprogram/dist/dev/mp-weixin`（开发）或 `apps/miniprogram/dist/build/mp-weixin`（生产）。`src/manifest.json` 的 `mp-weixin.appid` 必须填写自己拥有权限的真实小程序 AppID，仓库刻意留空。模拟器本地连接为 `ws://localhost:3000/ws`；真机需改为可访问的局域网地址或已登记的 WSS 地址，不能使用手机自己的 localhost。仅本地调试可按开发工具要求关闭域名检查，生产不能依赖此设置。

### 微信云托管与体验成员

本项目不会自动开通资源、上传或部署。用户确认费用后在自己的微信小程序账号下执行：

1. 在微信开发者工具或微信云托管控制台开通关联的小程序云环境，记下真实环境 ID；创建服务并记下真实服务名。确认小程序拥有该环境访问权限，跨环境使用需单独授权。
2. 以仓库根目录作为 Docker 构建上下文，Dockerfile 路径为根目录 `Dockerfile`。构建和部署后配置监听端口 `3000`，环境变量 `PORT=3000`、`NODE_ENV=production`；健康探测为 HTTP `/health`。云托管网关必须支持 WebSocket 升级及长连接，原生端点 `/ws`、网页 `/socket.io/` 和网页静态文件共用同一端口。
3. **实例数固定为一个，保持最小实例数一个并避免缩容到零。** 本服务只在进程内存保存房间，多副本会分裂房间；重启、更新、实例迁移均使房间和令牌失效。会话亲和本身不提供持久化保障。首次部署先通过健康探测和两端混合对局确认网关行为。
4. 在 `apps/miniprogram/.env.local` 设置 `VITE_CONNECTION_MODE=cloud`，填写 `VITE_CLOUD_ENV` 和 `VITE_CLOUD_SERVICE`；在 manifest 填真实 AppID。这三个值是部署标识，不是秘密。客户端执行 `wx.cloud.init` 后以 `wx.cloud.connectContainer({config:{env},service,path:'/ws'})` 建立连接，不拼接或分享身份令牌。不要提交私有配置或账户密钥。
5. 执行生产小程序构建，开发者工具导入 `dist/build/mp-weixin`，选择真实 AppID 和有权限的开发者账号。检查控制台、首页、Canvas 多页图片、相册授权、前后台切换及离线恢复。开发者工具基础库需支持云托管 `connectContainer`；不支持时升级工具与基础库，不回退为无鉴权公开接口。
6. 在开发者工具点击“上传”，填中文版本说明。小程序管理后台的“版本管理”将对应开发版本设置为体验版。在“成员管理”添加体验成员；成员扫描后台体验二维码进入。体验版和正式版的域名、云环境授权及隐私配置须独立检查，构建成功不代表微信审核或云连接通过。
7. 至少用两台设备加一个网页版参与同房，核查准备、锁词、候选同意/否决、超时、合组、个人返房、前后台恢复、分享路径和相册权限。后台挂起不主动离房；前台及网络恢复重连，未恢复身份和定向状态前按钮不可操作。

小程序房间分享仅携带 `roomCode`；恢复令牌只保存在 `uni` 本地存储。请求使用 `{requestId,event,data}`，确认返回 `{event:'ack',requestId,ok,data/error}`，状态独立推送 `{event:'room:state',data}`。确认超时及断线取消悬挂请求，不自动重放未知结果写操作。两传输共用唯一 GameService，实时、历史日志和候选按当时成员裁剪。

结果图默认仅包含全部回合词语；用户明确开启开关后才包含本人可见日志。Canvas 使用测量换行与固定高度分页，每页生成 PNG；预览和主动保存分开，保存取消或权限拒绝有中文说明。房间号、令牌不进入图片。

运行混合真实传输验证：`node scripts/mixed-runtime-verify.mjs`，证据为 `artifacts/混合传输运行验证.json`。本次已完成本机服务器、混合客户端和编译验证；未配置真实 AppID、云环境和服务，本机安装了微信开发者工具，但实际 CLI 导入被“工具的服务端口已关闭”阻止，未修改其安全设置。未完成开发工具导入、云托管连通、Canvas 真机渲染和设备相册验证。不要把本机协议验证当成真机验收。Docker 构建也已实际尝试，但 Docker Hub 匿名令牌请求网络超时，未完成镜像构建与容器运行。


一款支持 2–6 人的轻量实时聚会游戏。每位玩家私下提交一个词；揭晓时相同的非空答案自动组成持久同频小组。当揭晓合并后所有有效玩家属于同一个非空小组，或达到回合上限时，游戏结束。

## 技术栈

- Vue 3、Vite、TypeScript、Pinia、Vue Router
- Node.js、Express、Socket.IO、TypeScript
- 用于 Socket 类型协议和游戏规则的共享 workspace 包
- 房间保存在内存中，无数据库、无账号

## 本地开发

环境要求：Node.js 20+、pnpm 9+。

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

打开 `http://localhost:5173`。Vite 会把 Socket.IO 请求代理到 3000 端口的服务端。可再打开一个无痕浏览器窗口，在本机模拟多人游戏。

## 命令

```bash
pnpm dev          # 以监听模式运行 web 和 server
pnpm test         # 运行共享规则、前端 store 和 Socket 集成测试
pnpm typecheck    # 检查所有 workspace 的类型
pnpm build        # 执行生产构建
pnpm --filter @word-sync/server start
```

生产服务会在同一进程中提供构建后的 web 客户端和 `/health`，默认地址为 `http://localhost:3000`。

## 规则与行为

- 创建房间或使用六位房间码加入；昵称可留空，系统会独立随机选择多个中文前缀与水果组合。
- 创建者是房主，仅房主可在大厅修改计时器（默认 60 秒）和回合上限（默认 10 回合）。断线及再来一局保留房主身份；大厅或结果页主动离开后，按加入顺序转交房主。
- 每位玩家获得房间内互不重复的六色之一；改名、重连、合组与新局保持颜色。昵称采用深色页面亮色、白底分享深色版本，提交、聊天和事件保存颜色快照，退出后历史仍保留原色。
- 结果页「再玩一次」仅让点击者返回大厅；其他人继续查看冻结的旧局成员、设置、词语和授权日志。共享阶段保持结束，所有仍在房间成员返回、在线且准备后才开新局并重置活动历史。断线不算返回，刷新恢复个人页面；旧 gameId 返房请求被拒绝。
- 所有玩家准备后自动开始。所有人提交或时间结束前，每个人的词都保持私密；揭晓 5 秒后自动进入下一回合。
- 未成组玩家独立提交；持久组成员在写词阶段提出候选词，全组批准后立即一起提交，组员不能绕过候选直接个人提交。每组同时仅有一个未决候选，任何成员可批准或拒绝；更换候选必须先拒绝旧候选，再使用最新版本提出新候选。超时采用当前未拒绝的候选，没有候选则为空白。
- 揭晓自动合并相同非空词的玩家与持久组，无需邀请或批准成组；不同词、否决和离线都不会拆组；重叠组跨回合合并。揭晓合并后，所有有效玩家覆盖在同一个非空持久组才胜利，不能仅凭提交文本宣告胜利。
- 小组聊天只在写词阶段开放，服务端按小组成员过滤实时与历史消息。协议通过 roundId 与 proposalVersion 拒绝过期事件。
- 历史保留玩家实体、提交、候选与确认快照、提案决议、合并前后小组、结果、私聊以及准确起止时间和揭晓原因。
- 作答和揭晓阶段禁止主动离开，成员、小组、候选和历史不变。关闭页面、刷新或网络中断只标记离线；重新打开首页自动恢复身份、小组与候选并进入房间。恢复期间不能创建或加入，网络错误保留令牌，仅明确会话过期才清除。大厅与结果页可以主动离开。
- 所有状态都只保存在进程内存中，服务重启后会丢失。除非增加 Socket.IO adapter 和共享持久化，否则请仅运行一个服务副本。

## 环境变量

复制 `.env.example` 后按需修改：

- `PORT`：服务端端口，默认为 `3000`
- `CORS_ORIGIN`：前后端分开部署时，允许访问的 web 来源，多个来源用英文逗号分隔
- `VITE_SERVER_URL`：前端单独部署时使用的后端公开 URL；留空则使用当前来源

## Docker

```bash
docker build -t word-sync .
docker run --rm -p 3000:3000 -e PORT=3000 word-sync
```

然后打开 `http://localhost:3000`。

## 部署

可将 Docker 镜像部署到任何支持 WebSocket 的容器平台，例如 Fly.io、Railway、Render，或启用了会话亲和性的 Cloud Run。公开配置的 `PORT`，允许 WebSocket 升级，并且只运行一个副本，因为房间状态保存在内存中。健康检查路径为 `/health`。

如需分开部署，请把 `apps/web/dist` 部署到静态托管服务，在构建前设置 `VITE_SERVER_URL`，单独部署服务端，并将 `CORS_ORIGIN` 设为前端来源。生产环境中的两个端点都必须使用 HTTPS/WSS。

运行实际多客户端验证：`node scripts/runtime-verify.mjs`，证据保存于 `artifacts/runtime-verification.json`。

## 时间线与分享图片

未成组时「我的思考」仅本人可见，不会建立小组或开启提议。小组聊天、提议、同意、拒绝、驳回、通过和超时采用共用白话时间线；可见成员在创建事件时冻结，后来合组不能读取过去的私密记录。当前与历史候选也按当时成员裁剪。输入恢复服务端本人锁词；否决清除本组草稿，其他组不影响。

结果页「一键分享」默认仅包括全部轮次词语；「包含本人可见回合记录」默认不勾选。独立报告生成 PNG，正常长度一张，超限按记录分页，不截掉最后一轮。支持系统文件分享时打开分享面板，否则下载全部图片；取消或生成错误显示中文提示。导出不包含房间码、令牌、在线离线或调试快照。

个人返房专项浏览器验证：生产构建后执行 `node scripts/personal-view-verify.mjs`。复用本机 Chrome 与 Playwright，使用两个隔离上下文真实点击、刷新、核查深浅昵称并保存下载 PNG；证据在 `artifacts/个人返房浏览器验证.json` 和同目录中文命名图片。脚本自动停止自身服务。服务端专项集成回归覆盖六色唯一、重连、结果冻结、离线/未返回开局门槛和旧局请求。

浏览器分享验证：先生产构建，再执行 `node scripts/share-runtime-verify.mjs`。需要本机 Chrome 与 Playwright；可用 `PLAYWRIGHT_MODULE` 指定 Playwright 模块绝对路径。脚本强制系统分享不可用以核查下载降级，输出两种 PNG 与结束页截图到 `artifacts`。系统原生分享面板需在真实设备手动验证。
