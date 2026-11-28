# NijiEhon 项目维护

- 项目是静态多页网站。站点、账号服务与 Cloudflare Pages 的配置见 [README](README.md)，布局与交互规范见 [UI 设计规范](DESIGN_README.md)。
- 本地内容后台在 `tools/admin/`。有关内容数据、页面生成、跨电脑迁移与部署的问题，先读 [本地后台说明](tools/admin/README.md)。从 `published.json` 读取已发布内容，`tools/admin/.local/` 是本机工作数据。
- 调整商品、文章或海报时，从后台保存并生成。调整生成布局时，编辑 `tools/admin/content.mjs` 并重新生成页面。保留已有的商品和文章网址，核对首页、列表、详情和搜索。
- 商品「购买」可以打开规格与数量弹窗，保留弹窗内「下单」的禁用状态，直到用户要求接入购买与订单服务。发布流程是先从后台生成，再到 GitHub Desktop 审查、提交并推送 `main`，由 Cloudflare Pages 部署。本机草稿和服务凭据留在本机。
- 修改网页后运行 `node scripts/check.cjs`，启动并检查本地 HTTP 预览。能使用 Codex 内置浏览器时，在右侧打开。也可提供后台 `http://127.0.0.1:5621/` 和网站 `http://127.0.0.1:5621/preview/` 的预览链接。
