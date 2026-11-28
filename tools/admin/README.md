# NijiEhon 本地后台

## 换电脑后开始使用

1. 在 GitHub Desktop 克隆 [JianghaoPeng06/NijiEhon](https://github.com/JianghaoPeng06/NijiEhon)，或运行 `git clone https://github.com/JianghaoPeng06/NijiEhon.git`。已经克隆的电脑先同步 `main`。
2. 安装 Node.js 22 LTS 或更新的 LTS 版本。在 Windows 双击本目录的 `打开后台.cmd`，或通过 `创建桌面快捷方式.cmd` 安装桌面入口 **NijiEhon 后台**。两者都会用 Edge 应用模式打开独立窗口，找不到 Edge 时用 Chrome。仓库移到新位置后，重新创建快捷方式即可。
3. macOS 和 Linux 在仓库根目录运行 `node tools/admin/server.mjs`，访问 [127.0.0.1:5621](http://127.0.0.1:5621/)。Git 会同步后台源码、使用说明、已发布内容和图片。需要部署时，用有仓库写权限的 GitHub 账号推送 `main`。

## 编辑内容

- **商品**可编辑名称、图片、简介、说明、地区、分类、交付方式、购买须知、官网和规格，也可上架或下架。权重 5 优先于 1，首页取前三项。价格和小计统一用美元（USD），价格可选待公布、固定价格或起始价格。只有起始价格模式支持按规格改价，规格价格留空时沿用基准金额，列表显示所有可选规格中的最低金额。四件商品的价格和规格均为样例，正式使用前可在后台替换并取消样例标记。访客可以打开购买弹窗选择规格和数量，弹窗内的下单按钮保持禁用。
- **文章**支持作者、发布时间、置顶、权重、标签和相关商品。新文章的网址可按英文标题生成，只有中文标题时自动生成短地址，保存后网址固定。排序依次看置顶、权重、发布时间。阅读时间可填整数分钟，留空按正文估算。发布时间按本机时区输入，网站按北京时间显示日期。未来日期的文章在到点后的下一次生成中加入公开页面。
- **文章正文**在每个内容块内编辑，可插入、上移、下移和移除。支持段落、小标题、列表、引用、图片和 HTML。封面是可选的列表配图，正文可以插入独立图片，也可以用「使用封面」块复用。HTML 和 CSS 在独立框内渲染，脚本和表单受限。新增正文图片会随生成后的页面一起部署。
- **首页海报**支持 JPEG、PNG、WebP 和垂直裁切位置。后台和网站都按 16:9 取景。图片文件上限为 10 MB。
- **用户与订单**保留入口，购买系统上线后再接入。

## 预览与部署

1. 点击「保存」保存到本机。文章可边编辑边预览，商品预览显示保存后的当前记录。顶部「预览网站」展示当前可以发布的内容及首页海报。
2. 点击「生成网站」，更新本地页面、搜索索引及发布快照。使用中的新图片会复制到 `assets/content/`，生成完成时会运行静态检查。
3. 打开 GitHub Desktop 的 NijiEhon 仓库，在 Changes 查看页面和图片差异，填写 Summary，选择 Commit to main → Push origin。Cloudflare Pages 收到 `main` 的新提交后会自动构建网站。[Cloudflare Pages 部署记录](https://dash.cloudflare.com/1abaa82b108729621cc731ab27be8d88/pages/view/nijiehon)

本机草稿、已撤下记录及待用图片保存在 Git 忽略的 `tools/admin/.local/`。需要在另一台电脑接着编辑时，把整个目录复制过去，包括 `draft.json` 和 `uploads/`，并让目标电脑使用同一份 `published.json` 作为基线。两台电脑都已有草稿时，先各自备份，再合并需要保留的记录。生成后的 `published.json` 记录当次公开的内容及已撤下的网址，旧网址显示通用提示页。

## 维护交接

| 路径 | 职责 |
| --- | --- |
| `published.json` | 后台的已发布快照。没有本机草稿的新电脑从这里读取内容。 |
| `content.mjs` | 校验字段，排序与筛选内容，生成首页、列表、详情及搜索条目。 |
| `server.mjs` | 本地 API、保存、预览、上传和生成。 |
| `public/` | 后台界面与交互。 |
| `start.ps1` 和两个 `.cmd` | Windows 启动和桌面快捷方式。 |
| `../../assets/favicon.png` 和 `favicon.ico` | 𒀭 图标，分别用于网站及后台网页、Windows 桌面快捷方式。 |

首页、产品列表、研究列表和 `site.js` 中的 `BEGIN ADMIN` / `END ADMIN` 区块由生成器维护。要改内容，先用后台编辑。要改生成结构或详情页版式，改 `content.mjs`，再运行 `node tools/admin/server.mjs --generate`，审查生成差异。详情页复用产品或研究列表的页面外框。Cloudflare Pages 构建只复制仓库根目录的 HTML、CSS、JavaScript 和 `assets/`，后台程序留在本机。

维护后从仓库根目录运行 `node scripts/check.cjs`，并用本地后台确认保存、对应页面预览和生成。需要试新建、下架或 Git 发布时，使用独立测试副本。涉及公开登录界面时，可对 `http://127.0.0.1:5621/preview` 运行 `tests/auth-browser.cjs`，将 `TEST_ORIGIN` 设为该地址。订单服务接入前保持购买弹窗内的下单按钮禁用。
