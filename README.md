# NijiEhon

nijiehon.com 的国际数字生活网站，使用原生多页 HTML、CSS 和 JavaScript，无构建依赖。

## 本地查看

从仓库根目录运行 `py -m http.server 8001`，访问 http://127.0.0.1:8001 。已有预览服务时直接复用。真实登录需要 HTTP/HTTPS，不能双击 HTML 使用 file://。localhost 与 127.0.0.1 是不同来源，请始终使用配置中的同一地址。

## 页面和跳转

- index.html 按画稿展示访客首页、邮箱卡片、大阪站横幅、产品、研究和声明。访客显示登录卡片，登录后切换成欢迎卡片和个人中心入口，退出后恢复。
- research.html 展示精选与文章列表，guide-*.html 是正文。
- products.html 支持地区和类别组合筛选。product-*.html 介绍产品，随后跳转官方站点。
- terms.html、privacy.html、statement.html 分别为服务条款、隐私政策、声明的独立文章页，沿用原有文字。about.html 的旧锚点跳转到相应文章。
- 顶栏和页脚联系区统一提供带图标及外链箭头的 X（https://x.com/JianghaoPeng）、Telegram（https://t.me/NijiEhon）、邮箱（mailto:pengjasper@icloud.com）；捐赠仍进入站内页面。contact.html 兼容旧链接，打开首页联系菜单。
- 顶栏搜索在当前页打开悬浮窗口，支持即时筛选、方向键选择、Esc 关闭和 Ctrl/Cmd+K；search.html 兼容旧链接并转到首页搜索浮层。account.html 根据真实会话展示名称、邮箱、头像与退出按钮，访客显示登录提示。
- donate.html 提供预设及自定义金额。实际收款和订单服务尚未接入；不会把占位订单当成真实业务数据。

## 维护

产品与研究封面暂用用户提供的 `E:\网页图片` 照片，网页副本位于 `assets/placeholders/`（最长边 960px，JPEG 质量 85）。这些是排版占位照片，不是对应产品的实物图；同一内容的封面与缩略图保持一致。来源映射：Ultra Mobile → `IMG_0542.JPEG`，giffgaff → `IMG_6983.JPG`，Apple → `IMG_6974.JPG`，云服务器 → `IMG_6850.JPG`；号码选择 → `FullSizeRender.JPG`，开卡指南 → `IMG_4949.JPG`，云服务器指南 → `IMG_4162.JPG`。原文件未修改。

全站英文字体为 Google Sans，中文为 Noto Sans SC。`assets/fonts.css` 声明可变字重和 Unicode 分片，字体文件自托管于 `assets/fonts/`，按当前页面字符加载；两套字体的 OFL 许可保存在 assets 中。表单控件和页脚继承同一字体栈，部署时需一并上传字体目录及样式文件。

style.css 控制全站布局、响应式和减弱动画模式。site.js 处理菜单、筛选、搜索；auth.js 统一处理真实账号状态。原本输入任意邮箱即可登录的本机演示已移除，旧演示数据不会被当成真实账号。assets/station.jpg 来自草稿，作为可替换横幅。顶部导航与全站页脚保持同一结构：研究和产品直达汇总页，关于列出三篇独立文章，联系列出渠道和捐赠，账户提供登录与个人中心。更新标题和链接时同步检查首页、列表页、搜索及所有页面的顶部导航和页脚。上线时将 HTML、style.css、site.js、auth.js、auth-config.js 和 assets 一并放到静态托管根目录，再配置域名。SQL、测试与开发文件不需要发布。

## 导航与动效

面包屑位于页脚导航上方，显示当前页面层级。白色页脚底栏显示 `NijiEhon © 2026`、初始网站版本 `v0.1.0` 和向上展开的语言菜单；版权及版本号统一使用 Arial，语言仅提供「简体中文 中国」。发布新版本时同步更新所有页面的页脚版本号。

顶栏与个人中心使用真实头像图片，访客使用 `assets/default-avatar.png`（透明背景）。个人中心左上角返回站内上一页，无站内来源时返回首页；头像以圆形显示，点击可打开大图预览；资料区域使用白色背景。右上角编辑图标打开同一头像窗口，未登录时进入邮箱登录入口。访客可预览默认头像，登录后可在窗口中更换；支持 Esc、关闭按钮或点击遮罩关闭。登录后可更换头像，支持不超过 5 MB 的 PNG、JPEG、WebP，最长边缩放到 256px 后以保留透明通道的 PNG 上传至 Supabase 私有 avatars 桶。每个账号只有自己的 `<user-id>/avatar.png`；退出后清除页面显示，服务器头像保留，支持再次登录及跨设备读取。未上传自定义头像时使用默认图。

顶栏「研究」「产品」直接进入各自汇总页；「关于」展开三篇独立文章，「联系」展开联系渠道和捐赠页。个人中心是 account.html，登录入口连接首页邮箱验证码卡片。首页保留研究文章内容，搜索使用悬浮窗口。内页面包屑标明层级；研究文章直接连接对应产品。首屏依次落定，菜单以下拉帘幕展开，按钮按压有轻微反馈。系统启用减少动态效果时使用静态布局。

## 真实账号系统：Supabase Free + Resend Free

**当前状态：邮箱登录接入、页面同步、私有头像权限 SQL 已写好，并通过模拟接口测试。云端账号、SMTP 和真实邮件投递尚未配置或验证。** auth-config.js 的项目地址和公开密钥暂为空，因此页面提示“登录服务即将开放”，不会假装登录成功。

站点管理员可以用 GitHub 登录 Supabase 控制台；**网站客户只使用邮箱验证码注册/登录**，不需要 GitHub 账号，也不需要为网站创建 GitHub OAuth App。

### 免费额度（2026-11-28 查询）

| 服务 | 免费额度 | 后续升级 |
| --- | --- | --- |
| Supabase | 每月 50,000 活跃用户、500 MB 数据库、1 GB 文件、5 GB 出站流量；最多 2 个活跃免费项目，闲置 1 周会暂停 | Pro 从 $25/月起，保留项目与用户 |
| Resend | 每月 3,000 封验证码邮件、每天 100 封 | Pro 从 $20/月起，每月 50,000 封 |

先选择 Free；域名和已有托管费用另算。**100 封/天是邮件发送次数，不是 100 位用户**，重发、重复登录都会消耗额度。头像文件和流量也有额度限制。升级前以官方最新价格为准：[Supabase](https://supabase.com/pricing)、[Resend](https://resend.com/pricing)。免费项目因闲置暂停后需到控制台恢复。

### 1. 用 GitHub 创建 Supabase 免费项目

1. 打开 https://supabase.com/dashboard ，用你自己的 GitHub 账号登录，创建 Free 组织和 NijiEhon 项目，选择适合实际用户访问的地区。
2. 数据库密码保存在自己的密码管理器，不放入网站或聊天。
3. 在项目 Connect / Settings → API Keys 找到 **Project URL** 和 **Publishable key**（以 sb_publishable_ 开头）。将两个公开值填入 auth-config.js：

~~~js
window.NIJI_AUTH_CONFIG = Object.freeze({
  supabaseUrl: "https://你的项目编号.supabase.co",
  publishableKey: "sb_publishable_你的公开密钥",
  emailEnabled: true
});
~~~

4. 只需公开配置出现在前端。service_role / sb_secret_、数据库密码和 SMTP 密钥必须留在对应控制台；代码不接受旧版 JWT anon key，请使用新的 Publishable key。
5. Supabase → Authentication → Sign In / Providers：启用 Email、允许新用户注册、保留邮箱验证。设置 OTP 有效期（例如 10 分钟）。本网站接受 6–10 位数字验证码。
6. URL Configuration：本地测试 Site URL 使用 http://127.0.0.1:8001；正式上线改为实际 HTTPS 域名。此实现使用输入验证码的方式，不依赖点击邮件登录链接。

### 2. 配置 Resend 免费发信

1. 在 https://resend.com 注册免费账号，添加你持有的发信域名或子域名（例如 auth.nijiehon.com）。
2. 按 Resend 控制台给出的记录完成 DNS 验证。使用它实际提供的 SPF/DKIM 等记录，不要凭空复制别人的 DNS 值。
3. 创建发信 API key。Supabase → Authentication → SMTP Settings 启用自定义 SMTP：host 为 smtp.resend.com、port 为 465、username 为 resend、password 为 Resend API key。发件地址使用已验证域名（如 login@auth.nijiehon.com），发件人名称 NijiEhon。
4. SMTP 密钥只填 Supabase 控制台，不提交仓库、不放进 auth-config.js。
5. Supabase → Email Templates：将 **Magic Link** 模板改为验证码邮件，并检查 **Confirm Signup** 模板也包含验证码：

~~~html
<h2>NijiEhon 登录验证码</h2>
<p>请输入验证码：<strong>{{ .Token }}</strong></p>
<p>如果不是你本人发起，请忽略本邮件。</p>
~~~

6. 使用自己的邮箱测试新用户、已有用户、过期码、重发码以及垃圾邮件投递情况。Resend 未验证域名时不能作为向任意客户发信的正式配置。

Supabase 内置邮件只供测试，默认仅向项目团队成员邮箱发信，每小时 2 封，不能直接向公众开放。官方说明：[SMTP](https://supabase.com/docs/guides/auth/auth-smtp)、[邮箱 OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)、[Resend SMTP](https://resend.com/docs/send-with-smtp)。

### 3. 启用头像私有存储

在 Supabase SQL Editor 执行 supabase/setup.sql。脚本创建私有 avatars 桶，限制 PNG、1 MB，并用 RLS 限制每位已登录用户只能读写自己的 <user-id>/avatar.png。前端先缩小图片，再上传并更新账号头像版本。不要添加“允许所有人读写”的策略；已有同名桶时检查是否残留其他策略。

Auth user_metadata 只保存头像版本及展示信息，不用于管理员权限或订单授权。退出不会删除云端账号和头像。删除请求由管理员处理，须同时清理 Storage 对象和 Auth 用户，当前没有自助注销界面。

### 登录状态与页面行为

- 访客：首页显示邮箱输入卡片；个人中心显示默认头像、访客和登录入口。
- 请求验证码：调用 Supabase，成功后出现验证码输入框；**此时仍未登录**。支持更换邮箱和 60 秒重发冷却，服务端限流独立生效。
- 验证成功：首次自动注册，已有邮箱直接登录。首页显示欢迎卡片和个人中心入口，个人页显示邮箱、名称与头像，顶栏及页脚同步。
- 刷新/跨页：SDK 保存和刷新会话，启动时向服务器确认用户，不把旧的本机演示数据当成真实账号。
- 退出：本浏览器同源标签页同步恢复访客状态，清除页面上的私有头像；其他设备仍可保持登录。
- 头像：圆形显示，可点击预览和更换，透明 PNG 不铺底色，登录其他设备后也可读取自己的头像。
- 尚未配置服务、网络异常、验证码错误/过期、发送过于频繁时给出相应提示，不创建虚假的成功状态。

### 上线验收与扩展

1. 用真实配置跑通收信 → 验证 → 首页欢迎卡片 → 个人页 → 退出。再验证跨页刷新、两个同源标签页同步退出和关闭浏览器后恢复登录。
2. 上传透明 PNG，刷新后、另一设备登录后检查头像。用第二个测试账号验证不能读写第一个账号的存储路径。
3. 面向公众开放前配置 Supabase 服务端发信/验证限流。如启用 Supabase CAPTCHA，需先接入相应前端控件；页面倒计时不是反滥用措施。关注 Resend 每日/每月额度。
4. 代码仍为静态网站，Supabase 负责身份和私有存储。将来订单、付款或管理员操作必须由服务端验证用户并落实权限，不能依赖前端是否隐藏按钮。
5. 升级 Supabase 或 Resend 套餐可以保留现有代码与账号；无需为了付费方案重写登录系统。

### 实现文件与本地检查

- auth-config.js：公开项目配置。
- auth.js：邮箱 OTP、会话恢复、退出、头像和页面同步，不保存用户密码。
- assets/vendor/supabase-2.119.2.js：固定版本官方 SDK，本地托管；MIT 许可证在同目录 supabase-LICENSE。来源为 @supabase/supabase-js 2.119.2 的 dist/umd/supabase.js。
- supabase/setup.sql：私有头像桶和 RLS 策略。
- privacy.html：按邮箱认证和头像存储的实际处理方式更新。
- tests/auth-browser.cjs：用真实 SDK 与模拟 HTTP 接口检查配置缺失、旧演示拒绝、限流、验证码失败/成功、跨页恢复、双标签退出、头像上传同步、失效会话及手机布局。不发送真实邮件。

~~~powershell
node --check auth.js
node --check site.js
# 先启动本地服务器，再运行集成检查（需安装 Chrome）
node tests/auth-browser.cjs
~~~

测试默认访问 http://127.0.0.1:8001，可用 TEST_ORIGIN 环境变量调整；Chrome 路径可用 CHROME_PATH 指定。模拟接口测试不能替代自己项目上的邮件投递、令牌续期和 RLS 实际验收。

## GitHub Desktop 推送和版本发布

本地工作目录为 E:\github\NijiEhon，远程仓库为 https://github.com/JianghaoPeng06/NijiEhon ，main 跟踪 origin/main。无需把文件复制到其他目录，每次修改会直接显示在 GitHub Desktop。

日常更新：

1. GitHub Desktop 选择 NijiEhon；先 Fetch origin，有远程更新时先 Pull。
2. 修改此目录的文件，查看 Changes，确认没有加入密钥或临时文件。
3. 填写 Summary → Commit to main → Push origin。
4. 发布到网站取决于当前托管平台的 Git 集成；仓库推送和 GitHub Release 不等于修改 DNSSEC，也不会自动配置 Supabase。

正式发新版本：更新 VERSION、各页面页脚版本及 RELEASE_NOTES.md，运行 node scripts/check.cjs，再提交。GitHub Desktop 的 History 中右键目标提交 → Create Tag，输入如 v0.1.1，然后 Push origin（推送标签）。仓库中的 release.yml 会在版本标签推送后检查并创建同名 GitHub Release；普通修改只推送 main，不会每次都创建 Release。

版本号必须一致，例如 VERSION 的 0.1.0 对应标签 v0.1.0。不要移动已经发布的版本标签；后续版本使用新的编号。GitHub Desktop 官方说明：[提交与推送](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-a-repository-from-your-local-computer-to-github-desktop)、[管理标签](https://docs.github.com/en/desktop/managing-commits/managing-tags-in-github-desktop)。
