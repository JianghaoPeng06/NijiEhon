# NijiEhon 本地后台

## 换电脑后开始使用

1. 在 GitHub Desktop 克隆 [JianghaoPeng06/NijiEhon](https://github.com/JianghaoPeng06/NijiEhon)，或运行 `git clone https://github.com/JianghaoPeng06/NijiEhon.git`。已经克隆的电脑先同步 `main`。
2. 安装 Node.js 22 LTS 或更新的 LTS 版本。在 Windows 双击本目录的 `打开后台.cmd`，也可以双击 `创建桌面快捷方式.cmd`，以后从桌面打开 **NijiEhon 后台**。仓库移到新位置后，重新创建快捷方式即可。macOS 和 Linux 在仓库根目录运行 `node tools/admin/server.mjs`。
3. 在浏览器访问 [127.0.0.1:5621](http://127.0.0.1:5621/)。Git 会同步后台源码、使用说明、已发布内容和图片。需要从后台部署时，先让这台电脑上的 Git 能推送仓库的 `main`。

## 编辑内容

- **商品**可先存草稿，填写地区、分类和简介后上架，也可随时下架。权重 5 优先于 1，首页取前三项。价格可以待公布、显示固定价格或起始价格，可选币种和计价单位。现有商品已导入，价格默认待公布。商品详情的购买按钮为禁用状态。
- **文章**可设作者、发布时间、置顶、权重和相关商品。排序依次看置顶、权重、发布时间。阅读时间可填整数分钟，留空按正文估算。发布时间输入使用本机时区，网页日期按北京时间显示。未来日期的文章会在到点后的下一次生成或部署加入网站。写正文时用空行分段，可以用 `# `、`- ` 和 `> ` 开始小标题、列表和引用。
- **首页海报**支持 JPEG、PNG、WebP 和垂直裁切位置。后台和网站都按 16:9 取景。图片文件上限为 10 MB。
- **用户与订单**保留入口，购买系统上线后再接入。

## 预览与部署

1. 点击「保存」保存到本机。编辑器的预览会展示保存后的当前记录，包括草稿。顶部「预览网站」展示当前可以发布的内容及首页海报。两处预览都使用网站原有的样式和导航。
2. 点击「生成网站」更新仓库根目录的页面、搜索索引和发布快照，然后运行静态检查。可以在 GitHub Desktop 查看改动，并通过 Commit to main → Push origin 发布。
3. 点击「部署」也能生成、提交并推送已准备好的内容。后台使用现有 Git 凭据，推送 `origin/main` 后由 Cloudflare Pages 自动构建。后台只提交生成的内容。后台代码、公共样式和其他项目文件的变更可用 GitHub Desktop 审核后推送，也可以通过 Git 命令处理。[Cloudflare Pages 部署记录](https://dash.cloudflare.com/1abaa82b108729621cc731ab27be8d88/pages/view/nijiehon)

本机草稿、已撤下记录及待用图片保存在 Git 忽略的 `tools/admin/.local/`。需要在另一台电脑接着编辑时，把整个目录复制过去，包括 `draft.json` 和 `uploads/`，并让目标电脑使用同一份 `published.json` 作为基线。两台电脑都已有草稿时，先各自备份，再合并需要保留的记录。生成后的 `published.json` 记录当次公开的内容及已撤下的网址，旧网址显示通用提示页。

## 维护交接

| 路径 | 职责 |
| --- | --- |
| `published.json` | 后台的已发布快照。没有本机草稿的新电脑从这里读取内容。 |
| `content.mjs` | 校验字段，排序与筛选内容，生成首页、列表、详情及搜索条目。 |
| `server.mjs` | 本地 API、保存与预览、上传、生成及通过 Git 部署。 |
| `public/` | 后台界面与交互。 |
| `start.ps1` 和两个 `.cmd` | Windows 启动和桌面快捷方式。 |

首页、产品列表、研究列表和 `site.js` 中的 `BEGIN ADMIN` / `END ADMIN` 区块由生成器维护。要改内容，先用后台编辑。要改生成结构或详情页版式，改 `content.mjs`，再运行 `node tools/admin/server.mjs --generate`，审查生成差异。详情页复用产品或研究列表的页面外框。Cloudflare Pages 构建只复制仓库根目录的 HTML、CSS、JavaScript 和 `assets/`，后台程序留在本机。

维护后从仓库根目录运行 `node scripts/check.cjs`，并用本地后台确认保存、对应页面预览和生成。需要试新建、下架或 Git 发布时，使用独立测试副本。涉及公开登录界面时，可对 `http://127.0.0.1:5621/preview` 运行 `tests/auth-browser.cjs`，将 `TEST_ORIGIN` 设为该地址。用户与订单目前是待接入模块，公开商品按钮保持禁用。
