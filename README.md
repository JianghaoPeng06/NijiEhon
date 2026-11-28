# NijiEhon

nijiehon.com 的国际数字生活网站，使用原生多页 HTML、CSS 和 JavaScript，无构建依赖。

界面排版、控件、卡片和动效规则见 [UI 设计规范](DESIGN_README.md)。

## 生产环境交接

截至 2026-11-28，Cloudflare Pages 的构建配置已补全内页、样式和脚本，主站的 18 个页面均通过线上检查。站点使用 Supabase 提供邮箱账号和私有头像存储。[主站](https://nijiehon.com/) · [www 入口](https://www.nijiehon.com/) · [Pages 地址](https://nijiehon.pages.dev/)

### 账号与资源

本次使用已有的域名、GitHub 仓库、Cloudflare Pages 项目、Supabase 项目和 Resend 团队。新增的资源是 Resend 发信子域和专用密钥、Cloudflare 发信 DNS 记录、Squarespace 的 DNSSEC DS 记录，以及 Supabase 私有头像桶和三条访问策略。

| 服务 | 资源与职责 | 管理入口 |
| --- | --- | --- |
| GitHub | `JianghaoPeng06/NijiEhon` 是源码仓库，`main` 推送后触发生产部署 | [GitHub 仓库](https://github.com/JianghaoPeng06/NijiEhon) |
| Cloudflare | Pages 项目 `nijiehon` 负责托管。Cloudflare 同时管理权威 DNS、DNSSEC 签名和浏览器缓存策略 | [Pages 项目](https://dash.cloudflare.com/1abaa82b108729621cc731ab27be8d88/pages/view/nijiehon) |
| Squarespace / Google Workspace | `nijiehon.com` 在 Squarespace 管理，DNSSEC 的 DS 记录也保存在这里。域名控制台显示续费由 Google Workspace 管理 | [Squarespace 域名](https://account.squarespace.com/domains/managed/nijiehon.com) |
| Supabase | Free 项目 `NijiEhon` 位于首尔，负责访客注册、登录、会话和私有头像。管理员可使用已有的 GitHub 登录进入控制台 | [Supabase 项目](https://supabase.com/dashboard/project/iwujbfmunheilhndgibz) |
| Resend | 已有团队中新增发信域 `auth.nijiehon.com`，区域为东京。专用密钥 `NijiEhon Supabase SMTP` 仅有该域名的发信权限 | [Resend 发信域](https://resend.com/domains/4c572718-8977-4405-87b9-6d93ec316518) · [API Keys](https://resend.com/api-keys) |

### 需要保管的访问权限

- 保留 GitHub 仓库、Cloudflare、Squarespace、Google Workspace、Supabase 和 Resend 的管理员访问方式及双重验证恢复信息。生产发布、域名续费、DNS 和邮件分别在上表对应的服务中管理。
- 浏览器只使用 [auth-config.js](auth-config.js) 中的 Project URL 和 `sb_publishable_` 公开密钥。数据库密码、`sb_secret_` 或旧的 `service_role` 密钥应保存在密码管理器或服务器配置中。
- Resend SMTP 密钥仅填在 Supabase 的 SMTP 密码字段。轮换时，在 Resend 创建一个同样限定至 `auth.nijiehon.com` 的发信密钥，更新 Supabase 并验证投递，再撤销旧密钥。邮件登录用户通过网站自行注册，管理员在 Supabase Authentication → Users 中查看。

### 域名、DNSSEC 与发信记录

- 权威 DNS 为 Cloudflare 的 `gigi.ns.cloudflare.com` 和 `odin.ns.cloudflare.com`。DNSSEC 已启用，Squarespace 已发布匹配的 DS，验收时的 Key Tag 为 `2371`、算法为 `13`、摘要类型为 `2`（SHA-256）。两台 `.com` 权威服务器均返回了该记录，多家公共解析器验证通过。[Cloudflare DNSSEC 设置](https://dash.cloudflare.com/1abaa82b108729621cc731ab27be8d88/nijiehon.com/dns/settings) · [注册局记录](https://rdap.verisign.com/com/v1/domain/nijiehon.com)
- 如需停用 DNSSEC 或采用先停用再迁移的方式更换权威 DNS，先在 Squarespace 移除 DS，等父区记录的 TTL 到期，再停用 Cloudflare 签名或更换名称服务器。[Cloudflare DNSSEC 操作说明](https://developers.cloudflare.com/dns/dnssec/)
- Resend 发信依赖 Cloudflare 上的两个 CNAME（`send.auth`、`rsend.auth`）和一个 DKIM TXT（`resend._domainkey.auth`）。重建或迁移 DNS 时，以 Resend 控制台显示的当前值为准。[Resend 发信记录](https://resend.com/domains/4c572718-8977-4405-87b9-6d93ec316518)

## 本地查看

从仓库根目录运行 `py -m http.server 8001`，访问 http://127.0.0.1:8001 。已有预览服务时直接复用。真实登录需要 HTTP/HTTPS，不能双击 HTML 使用 file://。localhost 与 127.0.0.1 是不同来源，请始终使用配置中的同一地址。

## 页面和跳转

- index.html 按画稿展示访客首页、邮箱卡片、大阪站横幅、产品、研究和声明。访客显示登录卡片，登录后切换成欢迎卡片和个人中心入口，退出后恢复。
- research.html 展示精选与文章列表，guide-*.html 是正文。
- products.html 支持地区和类别组合筛选。product-*.html 介绍产品，随后跳转官方站点。
- terms.html、privacy.html、statement.html 分别为服务条款、隐私政策、声明的独立文章页。about.html 的旧锚点跳转到相应文章。
- 顶栏和页脚联系区统一提供带图标及外链箭头的 X（https://x.com/JianghaoPeng）、Telegram（https://t.me/NijiEhon）、邮箱（mailto:pengjasper@icloud.com）；捐赠仍进入站内页面。contact.html 兼容旧链接，打开首页联系菜单。
- 顶栏搜索在当前页打开悬浮窗口，支持即时筛选、方向键选择、Esc 关闭和 Ctrl/Cmd+K；search.html 兼容旧链接并转到首页搜索浮层。account.html 根据真实会话展示名称、邮箱、头像与退出按钮，访客显示登录提示。
- donate.html 提供预设及自定义金额。实际收款和订单服务尚未接入；不会把占位订单当成真实业务数据。

## 维护

产品与研究封面暂用用户提供的 `E:\网页图片` 照片，网页副本位于 `assets/placeholders/`（最长边 960px，JPEG 质量 85）。这些是排版占位照片，不是对应产品的实物图；同一内容的封面与缩略图保持一致。来源映射：Ultra Mobile → `IMG_0542.JPEG`，giffgaff → `IMG_6983.JPG`，Apple → `IMG_6974.JPG`，云服务器 → `IMG_6850.JPG`；号码选择 → `FullSizeRender.JPG`，开卡指南 → `IMG_4949.JPG`，云服务器指南 → `IMG_4162.JPG`。原文件未修改。

全站英文字体为 Google Sans，中文为 Noto Sans SC。`assets/fonts.css` 声明可变字重和 Unicode 分片，字体文件自托管于 `assets/fonts/`，按当前页面字符加载；两套字体的 OFL 许可保存在 assets 中。表单控件和页脚继承同一字体栈，部署时需一并上传字体目录及样式文件。

style.css 控制全站布局、响应式和减弱动画模式。site.js 处理菜单、筛选、搜索；auth.js 统一处理真实账号状态。原本输入任意邮箱即可登录的本机演示已移除，旧演示数据不会被当成真实账号。assets/station.jpg 来自草稿，作为可替换横幅。顶部导航与全站页脚保持同一结构：研究和产品直达汇总页，关于列出三篇独立文章，联系列出渠道和捐赠，账户提供登录与个人中心。更新标题和链接时同步检查首页、列表页、搜索及所有页面的顶部导航和页脚。生产发布由下方的 Cloudflare Pages 流程完成。

## 导航与动效

面包屑位于页脚导航上方，显示当前页面层级。白色页脚底栏显示 `NijiEhon © 2026`、与 `VERSION` 一致的网站版本号和向上展开的语言菜单。版权及版本号统一使用 Arial，语言仅提供「简体中文 中国」。发布新版本时同步更新所有页面的页脚版本号。

顶栏与个人中心使用真实头像图片，访客使用 `assets/default-avatar.png`（透明背景）。个人中心标题右侧的齿轮提供修改昵称、修改头像、设置或修改密码和退出登录。访客点击齿轮会进入邮箱登录入口。点击圆形头像可打开修改头像窗口，访客可预览默认头像。窗口支持 Esc、关闭按钮或点击遮罩关闭。登录后可更换头像，支持不超过 5 MB 的 PNG、JPEG、WebP，最长边缩放到 256px 后以保留透明通道的 PNG 上传至 Supabase 私有 avatars 桶。每个账号只有自己的 `<user-id>/avatar.png`；退出后清除页面显示，服务器头像保留，支持再次登录及跨设备读取。未上传自定义头像时使用默认图。

顶栏「研究」「产品」直接进入各自汇总页；「关于」展开三篇独立文章，「联系」展开联系渠道和捐赠页。个人中心是 account.html，登录入口连接首页邮箱登录卡片。首页保留研究文章内容，搜索使用悬浮窗口。内页面包屑标明层级；研究文章直接连接对应产品。首屏和弹窗使用轻量入场，按钮按下时改变背景色。系统启用减少动态效果时使用静态布局。

## 邮箱登录与头像

网站默认使用邮箱和密码登录。新用户选择「注册」，设置密码并用邮件验证码确认邮箱。已有验证码账号的用户可选择「验证码登录」，再打开个人中心右上角的「设置」设置密码。忘记密码时从登录页选择「找回密码」，验证邮箱后即可设置新密码。[线上登录入口](https://nijiehon.com/#login)

### 免费额度（2026-11-28 查询）

| 服务 | 免费额度 | 后续升级 |
| --- | --- | --- |
| Supabase | 每月 50,000 活跃用户、500 MB 数据库、1 GB 文件、5 GB 普通出站和 5 GB 缓存出站。最多 2 个活跃免费项目，闲置 1 周会暂停 | Pro 从 $25/月起，保留项目与用户 |
| Resend | 每团队每月 3,000 封、每天 100 封、最多 3 个发信域名 | Pro 从 $20/月起，每月 50,000 封 |

Resend 的额度由同一团队下的域名共享。每次实际寄出的注册验证、重置密码或登录验证码邮件都会使用发信额度，重发同样计入。日常使用邮箱和密码登录不会发信。Supabase Free 项目因闲置暂停后可在控制台恢复。域名续费单独管理。[Supabase 套餐](https://supabase.com/pricing) · [Resend 套餐](https://resend.com/pricing)

### 生产配置

- **Supabase Authentication → Sign In / Providers** 已启用 Email、允许新用户注册并要求验证邮箱。新密码至少 8 个字符且最多 72 字节。已开启 Secure password change，登录超过 24 小时的会话需要重新登录后再修改密码。**URL Configuration** 的 Site URL 为 `https://nijiehon.com`。[邮箱密码文档](https://supabase.com/docs/guides/auth/passwords) · [邮箱 OTP 文档](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- **Emails → SMTP Settings** 已启用自定义 SMTP。主机为 `smtp.resend.com`，端口 `465`，用户名 `resend`，密码为上文的专用 Resend 密钥。发件人是 `NijiEhon <login@auth.nijiehon.com>`。[Supabase SMTP 文档](https://supabase.com/docs/guides/auth/auth-smtp) · [Resend SMTP 文档](https://resend.com/docs/send-with-smtp)
- **Emails → Templates** 的 Confirm sign up、Magic link or OTP 和 Reset password 都使用 `{{ .Token }}` 生成数字验证码，主题分别为「NijiEhon 注册验证码」「NijiEhon 登录验证码」和「NijiEhon 密码重置验证码」。前端接受 6–10 位数字。
- **Authentication → Rate Limits** 管理服务器端发信和验证限流。排查验证码问题时，同时查看 Supabase Auth 日志、Resend 发送状态和团队额度。

### 私有头像存储

生产项目已创建私有 `avatars` 桶和读取、上传、更新三条 RLS 策略。桶接收不超过 1 MB 的 PNG，每个登录用户只能读写自己的 `<user-id>/avatar.png`。前端会先缩小图片，再上传并更新账号头像版本。需要在新项目复建时，使用 [supabase/setup.sql](supabase/setup.sql)。已有同名桶时先检查其中的访问策略。

Auth user_metadata 只保存头像版本及展示信息，不用于管理员权限或订单授权。退出不会删除云端账号和头像。删除请求由管理员处理，须同时清理 Storage 对象和 Auth 用户，当前没有自助注销界面。

### 登录状态与页面行为

- 首页默认显示邮箱和密码，并提供注册、验证码登录、找回密码入口。访客进入个人中心时可看到登录按钮。
- 请求验证码成功后，页面显示验证码输入框。可以更换邮箱，重发间隔为 60 秒，Supabase 仍执行自己的限流设置。
- 注册验证和验证码登录成功后进入已登录状态。通过找回密码验证后，页面显示新密码表单。首页欢迎卡片、个人中心及导航显示当前账号。
- 刷新/跨页：SDK 保存和刷新会话，启动时向服务器确认用户，不把旧的本机演示数据当成真实账号。
- 退出：本浏览器同源标签页同步恢复访客状态，清除页面上的私有头像；其他设备仍可保持登录。
- 头像：圆形显示，可点击预览和更换，透明 PNG 不铺底色，登录其他设备后也可读取自己的头像。
- 尚未配置服务、网络异常、验证码错误/过期、发送过于频繁时给出相应提示，不创建虚假的成功状态。

### 上线验收

- 本次在生产 Supabase 创建了验收账号 `delivered@resend.dev`。注册和登录验证码均通过 Resend 模拟投递，真实网站完成了验证、进入个人中心和退出。[Resend 模拟投递](https://resend.com/changelog/sending-test-emails)
- 头像桶的私有状态和 RLS 策略已在生产数据库核对。头像上传、跨标签页退出和失效会话已通过模拟接口的浏览器测试。更改存储权限后，用两个测试账号复核各自只能访问自己的头像。
- 将来接入订单、付款或管理员功能时，由服务端验证身份和执行权限检查。

### 实现文件与本地检查

- auth-config.js：公开项目配置。
- auth.js：密码登录、邮箱验证码、密码设置与恢复、会话同步及头像。密码由 Supabase Auth 管理。
- assets/vendor/supabase-2.119.2.js：固定版本官方 SDK，本地托管；MIT 许可证在同目录 supabase-LICENSE。来源为 @supabase/supabase-js 2.119.2 的 dist/umd/supabase.js。
- supabase/setup.sql：私有头像桶和 RLS 策略。
- privacy.html：按邮箱认证和头像存储的实际处理方式更新。
- tests/auth-browser.cjs：用真实 SDK 和模拟 HTTP 接口检查密码登录、旧用户设置密码、注册及重发、验证码登录、密码恢复、会话同步、头像上传和手机布局。

~~~powershell
node --check auth.js
node --check site.js
# 先启动本地服务器，再运行集成检查（需安装 Chrome）
node tests/auth-browser.cjs
~~~

测试默认访问 http://127.0.0.1:8001，可用 TEST_ORIGIN 环境变量调整；Chrome 路径可用 CHROME_PATH 指定。模拟接口测试不能替代自己项目上的邮件投递、令牌续期和 RLS 实际验收。

## GitHub Desktop 推送和版本发布

本地工作目录为 E:\github\NijiEhon，远程仓库为 https://github.com/JianghaoPeng06/NijiEhon ，main 跟踪 origin/main。无需把文件复制到其他目录，每次修改会直接显示在 GitHub Desktop。

### 日常部署

1. 在 GitHub Desktop 选择 NijiEhon，先 Fetch origin，有远程更新再 Pull。
2. 修改此目录的文件，查看 Changes，确认没有加入密钥或临时文件。
3. 填写 Summary → Commit to main → Push origin。
4. Cloudflare Pages 对 `main` 已开启生产自动部署。去 Deployments 核对提交和结果，再访问正式域名。生产邮箱登录由提交 `950a54a` 推送后自动上线。[Pages 设置](https://dash.cloudflare.com/1abaa82b108729621cc731ab27be8d88/pages/view/nijiehon/settings) · [部署记录](https://dash.cloudflare.com/1abaa82b108729621cc731ab27be8d88/pages/view/nijiehon/d81815f3-d170-4545-9887-c3db3da52ccb)

Pages 的 Framework preset 为 `None`，使用仓库根目录，Build output directory 为 `dist`。构建命令发布根目录的 HTML、CSS、JavaScript 和整个 `assets` 目录。

~~~sh
mkdir -p dist && cp -- *.html *.css *.js dist/ && cp -R assets dist/
~~~

### 缓存与排查

- Cloudflare 的 Caching Level 为 `Standard`，Browser Cache TTL 为 `Respect Existing Headers`，与 `jasperpeng.uk` 的设置一致。此前的 CSS/JavaScript 专用缓存规则已停用。主域名和 `www` 的页面、CSS、JavaScript、图片和字体实测均返回 `max-age=0, must-revalidate`。浏览器再次使用资源时会重新验证，未变更的资源可从本地缓存复用。[Cloudflare 缓存设置](https://dash.cloudflare.com/1abaa82b108729621cc731ab27be8d88/nijiehon.com/caching/configuration) · [Browser Cache TTL 说明](https://developers.cloudflare.com/cache/how-to/edge-browser-cache-ttl/)
- 浏览器若还保留以前的 4 小时缓存，可按一次 `Ctrl+F5`。网页缺样式或内页回到首页时，先查 Pages 的构建产物，再请求 `/style.css` 和 `/auth-config.js` 确认分别返回 CSS 和 JavaScript。

### 正式版本

正式发新版本：更新 VERSION、各页面页脚版本及 RELEASE_NOTES.md，运行 node scripts/check.cjs，再提交。GitHub Desktop 的 History 中右键目标提交 → Create Tag，输入如 v0.1.1，然后 Push origin（推送标签）。启用且允许运行 GitHub Actions 时，release.yml 可在版本标签推送后检查并创建同名 GitHub Release；若 Actions 未启动，到 GitHub → Releases → Draft a new release，选择已推送的标签，填写 RELEASE_NOTES.md 的内容并发布。普通修改只推送 main，不会每次都创建 Release。v0.1.0 的代码和标签已通过 GitHub Desktop 推送，Release 通过 GitHub 发布页完成。

版本号必须一致，例如 VERSION 的 0.1.0 对应标签 v0.1.0。不要移动已经发布的版本标签；后续版本使用新的编号。GitHub Desktop 官方说明：[提交与推送](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-a-repository-from-your-local-computer-to-github-desktop)、[管理标签](https://docs.github.com/en/desktop/managing-commits/managing-tags-in-github-desktop)。
