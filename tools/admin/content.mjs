export const collections = ['products', 'articles'];
const currency = 'USD';
export const imagePath = /^assets\/(?:placeholders\/[a-z0-9-]+\.jpg|station\.jpg|content\/[a-f0-9]{64}\.(?:jpg|png|webp))$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const formatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' });
const blockTypes = ['text', 'heading', 'list', 'quote', 'image', 'cover', 'html'];

function field(value, label, max, required = false) {
  const text = typeof value === 'string' ? value.trim() : '';
  if ((required && !text) || text.length > max) throw new Error(`${label}需要${required ? ' 1 至' : '不超过'} ${max} 个字符。`);
  return text;
}

function choice(value, options, label) {
  if (!options.includes(value)) throw new Error(`${label}无效。`);
  return value;
}

function slug(value) {
  const name = field(value, '网址标识', 60, true);
  if (!slugPattern.test(name)) throw new Error('网址标识只能用小写字母、数字和单个连字符。');
  return name;
}

function image(value) {
  if (value && !imagePath.test(value)) throw new Error('请选择后台上传的图片。');
  return value || '';
}

export function normalizePoster(values) {
  if (!values.image) throw new Error('请选择首页海报图片。');
  return { image: image(values.image), alt: field(values.alt, '图片描述', 180, true), position: choice(values.position, ['top', 'center', 'bottom'], '裁切位置') };
}

function legacyBlocks(text) {
  return (text || '').split(/\r?\n\s*\r?\n/).filter(Boolean).map(value => {
    const lines = value.split(/\r?\n/);
    if (lines.length === 1 && /^#{1,3} /.test(value)) return { type: 'heading', text: value.replace(/^#{1,3} /, '') };
    if (lines.every(line => /^[-*] /.test(line))) return { type: 'list', text: lines.map(line => line.slice(2)).join('\n') };
    if (lines.every(line => line.startsWith('> '))) return { type: 'quote', text: lines.map(line => line.slice(2)).join('\n') };
    return { type: 'text', text: value };
  });
}

function articleBlocks(values) {
  const blocks = values.blocks ?? legacyBlocks(values.body);
  if (!Array.isArray(blocks) || blocks.length > 100) throw new Error('正文最多可包含 100 个内容块。');
  const normalized = blocks.flatMap(block => {
    const type = choice(block.type, blockTypes, '正文块类型');
    if (type === 'image' || type === 'cover') {
      const caption = field(block.caption, '图注', 300);
      if (type === 'cover') {
        if (!values.image) throw new Error('正文使用了封面，请添加封面或移除该正文块。');
        return [{ type, caption }];
      }
      const source = image(block.image);
      if (!source) return [];
      return [{ type, image: source, alt: field(block.alt, '图片描述', 180), caption }];
    }
    const text = field(block.text, '正文块', type === 'heading' ? 160 : 40000);
    return text ? [{ type, text }] : [];
  });
  if (normalized.reduce((length, block) => length + (block.text?.length || 0), 0) > 40000) throw new Error('正文总长度最多 40000 个字符。');
  return normalized;
}

function amount(value, label, required = false) {
  const price = field(value, label, 13, required);
  if (price && !/^\d{1,10}(?:\.\d{1,2})?$/.test(price)) throw new Error(`${label}须为非负美元金额，整数最多 10 位，小数最多两位。`);
  return price;
}

export function normalizeRecord(collection, values) {
  const article = collection === 'articles';
  const status = choice(values.status, ['draft', 'published', 'archived'], '状态');
  const record = {
    slug: slug(values.slug), title: field(values.title, '标题', 100, true),
    summary: field(values.summary, '简介', 500, !article && status === 'published'),
    image: image(values.image), imageAlt: field(values.imageAlt, '图片描述', 180),
    keywords: field(values.keywords, '搜索关键词', 200),
    weight: choice(Number(values.weight), [1, 2, 3, 4, 5], '权重'), status
  };
  if (article) {
    const blocks = articleBlocks(values);
    if (!blocks.length && status === 'published') throw new Error('发布文章至少需要一个正文块。');
    const rawTags = Array.isArray(values.tags) ? values.tags : (values.tags || '').split(/[,，、\n]/);
    const tags = [...new Set(rawTags.map(tag => field(tag, '标签', 24)).filter(Boolean))];
    if (tags.length > 12) throw new Error('每篇文章最多 12 个标签。');
    const date = values.date ? new Date(values.date) : null;
    if (!Number.isFinite(date?.getTime()) && (values.date || status === 'published')) throw new Error('请输入有效的发布时间。');
    const read = values.read === '' || values.read == null ? null : Number(values.read);
    if (read !== null && (!Number.isInteger(read) || read < 1 || read > 300)) throw new Error('阅读时间须为 1 至 300 分钟，或留空自动估算。');
    return { ...record, englishTitle: field(values.englishTitle, '英文标题', 100), author: field(values.author, '作者', 80) || 'NijiEhon', date: date ? date.toISOString() : '', read, pinned: values.pinned === true, tags, blocks, related: [...new Set((values.related || []).map(slug))] };
  }

  const region = field(values.region, '地区', 32, status === 'published');
  const category = field(values.category, '分类', 32, status === 'published');
  if (region === '全部' || category === '全部') throw new Error('「全部」保留给筛选按钮，请填写具体地区或分类。');
  const url = field(values.url, '官方网站', 2000);
  if (url) {
    const parsed = URL.parse(url);
    if (parsed?.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('官方网站需要使用有效的 HTTPS 链接。');
  }
  const priceMode = choice(values.priceMode || 'hidden', ['hidden', 'fixed', 'from'], '价格类型');
  if (priceMode !== 'hidden' && values.currency && values.currency !== currency) throw new Error('商品统一使用美元，请以 USD 填写价格。');
  const price = priceMode === 'hidden' ? '' : amount(values.price, '价格', true);
  const unit = price ? field(values.unit, '计价单位', 16) : '';
  const options = values.variants ?? [];
  if (!Array.isArray(options) || options.length > 20) throw new Error('一个商品最多可添加 20 个规格。');
  const variants = options.map(option => ({ name: field(option.name, '规格名称', 80, true), price: priceMode === 'from' ? amount(option.price, '规格价格') : '' }));
  if (new Set(variants.map(option => option.name.toLowerCase())).size !== variants.length) throw new Error('规格名称不能重复。');
  return { ...record, region, category, url, currency, priceMode, price, unit, variants, body: field(values.body, '商品说明', 40000), delivery: field(values.delivery, '交付方式', 150), notice: field(values.notice, '购买须知', 2000), sample: values.sample === true };
}

export function recordImages(item) {
  return [item.image, ...(item.blocks || []).filter(block => block.type === 'image').map(block => block.image)].filter(Boolean);
}

export function route(collection, id) {
  return `${collection === 'products' ? 'product' : 'guide'}-${id}.html`;
}

export function visible(data, now = Date.now()) {
  return {
    products: data.products.filter(item => item.status === 'published').sort((a, b) => b.weight - a.weight),
    articles: data.articles.filter(item => item.status === 'published' && Date.parse(item.date) <= now)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.weight - a.weight || b.date.localeCompare(a.date))
  };
}

export function snapshot(data, previous, now) {
  const active = visible(data, now);
  const names = collections.flatMap(collection => active[collection].map(item => route(collection, item.slug)));
  const old = collections.flatMap(collection => previous[collection].map(item => route(collection, item.slug)));
  return { poster: data.poster, ...active, retired: [...new Set([...previous.retired, ...old])].filter(name => !names.includes(name)).sort() };
}

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => entities[char]);

function articleMeta(item, pinned = false) {
  const parts = item.date ? formatter.formatToParts(new Date(item.date)) : [];
  const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const iso = parts.length ? `${date.year}-${date.month.padStart(2, '0')}-${date.day.padStart(2, '0')}` : '';
  const display = parts.length ? `<time datetime="${iso}">${date.year} 年 ${date.month} 月 ${date.day} 日</time> · ` : '';
  const text = item.blocks.map(block => block.type === 'html' ? block.text.replace(/<[^>]*>/g, ' ') : block.text || block.caption || '').join(' ');
  const han = text.match(/\p{Script=Han}/gu) || [];
  const words = text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+/gu) || [];
  const minutes = item.read ?? Math.max(1, Math.ceil(han.length / 350 + words.length / 220));
  return `<span class="article-meta">${pinned && item.pinned ? '置顶 · ' : ''}${display}${escape(item.author)} · 约 ${minutes} 分钟阅读</span>`;
}

function imageTag(item, css) {
  if (!item.image) return '';
  return `<img class="${css}" src="${escape(item.image)}" alt="${escape(item.imageAlt)}" loading="lazy" decoding="async">`;
}

function displayPrice(item) {
  if (item.priceMode === 'hidden') return '价格待公布';
  const prices = item.variants.map(option => Number(option.price || item.price));
  const base = prices.length ? Math.min(...prices) : Number(item.price);
  const amount = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: item.currency, currencyDisplay: 'code' }).format(base);
  return `${amount}${item.priceMode === 'from' ? ' 起' : ''}${item.unit ? ` / ${escape(item.unit)}` : ''}`;
}

function productCard(item) {
  return `<a class="tile" href="${route('products', item.slug)}" data-region="${escape(item.region)}" data-category="${escape(item.category)}">\n${imageTag(item, 'cover')}<span>${escape(item.title)}${item.priceMode === 'hidden' ? '' : `<small class="article-meta">${item.sample ? '样例 · ' : ''}${displayPrice(item)}</small>`}</span></a>`;
}

function articleCard(item, featured = false) {
  return `<a${featured ? ' class="tile"' : ''} href="${route('articles', item.slug)}">\n${imageTag(item, featured ? 'cover' : 'mini') || (featured ? '' : '<span class="mini content-placeholder" aria-hidden="true"></span>')}\n<div><span class="article-title">${escape(item.title)}</span>${articleMeta(item, true)}</div>\n</a>`;
}

function bodyBlock(block, item) {
  switch (block.type) {
    case 'heading': return `<h2>${escape(block.text)}</h2>`;
    case 'list': return `<ul>${block.text.split(/\r?\n/).filter(line => line.trim()).map(line => `<li>${escape(line)}</li>`).join('')}</ul>`;
    case 'quote': return `<blockquote><p>${escape(block.text).replace(/\r?\n/g, '<br>')}</p></blockquote>`;
    case 'image':
    case 'cover': {
      const image = block.type === 'cover' ? item : { image: block.image, imageAlt: block.alt };
      return `<figure class="article-figure">${imageTag(image, 'article-image')}${block.caption ? `<figcaption>${escape(block.caption)}</figcaption>` : ''}</figure>`;
    }
    case 'html': {
      const document = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; base-uri 'none'; form-action 'none'"><style>body{margin:0;display:flow-root;font:1rem/1.65 system-ui,sans-serif;color:#151516;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style><body>${block.text}</body></html>`;
      return `<iframe class="article-html" data-article-html title="文章 HTML 内容" sandbox="allow-same-origin" loading="lazy" srcdoc="${escape(document)}"></iframe>`;
    }
    default: return `<p>${escape(block.text).replace(/\r?\n/g, '<br>')}</p>`;
  }
}

function productDetails(item) {
  const photo = item.image && `<div class="product-visual">${imageTag({ ...item, imageAlt: item.imageAlt || item.title }, 'product-image')}</div>`;
  const info = [item.region, item.category].filter(Boolean).map(escape).join(' · ');
  const variants = item.variants.length ? item.variants : [{ name: '默认规格', price: '' }];
  const options = variants.map((variant, index) => `<option value="${index}" data-price="${item.priceMode === 'hidden' ? '' : escape(variant.price || item.price)}">${escape(variant.name)}</option>`).join('');
  const official = item.url ? `<a class="pill" href="${escape(item.url)}">前往官方网站</a>` : '';
  return `<article class="product-detail${photo ? '' : ' product-detail-text'}">
${photo || ''}
<div class="product-information">
${info ? `<p class="product-kicker">${info}</p>` : ''}
<h1>${escape(item.title)}</h1>
<p class="product-price">${item.sample ? '<span>样例价格</span> ' : ''}${displayPrice(item)}</p>
${item.summary ? `<p class="product-intro">${escape(item.summary)}</p>` : ''}
${item.body ? `<section class="product-description"><h2>商品说明</h2><div class="content-body">${legacyBlocks(item.body).map(block => bodyBlock(block)).join('\n')}</div></section>` : ''}
${item.delivery ? `<p class="product-delivery"><strong>交付方式</strong> ${escape(item.delivery)}</p>` : ''}
${item.notice ? `<p class="product-notice"><strong>购买须知</strong> ${escape(item.notice).replace(/\r?\n/g, '<br>')}</p>` : ''}
<div class="content-actions"><button class="pill dark" type="button" data-buy-product aria-haspopup="dialog" aria-controls="product-purchase">购买</button>${official}</div>
</div>
</article>
<dialog class="purchase-dialog" id="product-purchase" aria-labelledby="purchase-title" data-currency="${escape(item.currency)}">
<form method="dialog" class="purchase-panel">
<div class="purchase-heading"><div><h2 id="purchase-title">选择购买选项</h2><p>${escape(item.title)}</p></div><button type="submit" formnovalidate class="icon-button" aria-label="关闭">×</button></div>
<label class="purchase-field">规格<select id="purchase-spec" autofocus>${options}</select></label>
<div class="purchase-field"><label for="purchase-quantity">数量</label><div class="purchase-quantity"><button type="button" data-quantity-step="-1" aria-label="减少数量">−</button><input id="purchase-quantity" type="number" value="1" min="1" max="99" step="1" inputmode="numeric"><button type="button" data-quantity-step="1" aria-label="增加数量">+</button></div></div>
<div class="purchase-total"><span>${item.sample ? '样例小计' : '参考小计'}</span><output id="purchase-total" aria-live="polite">${displayPrice(item)}</output></div>
<p class="purchase-note">下单功能暂未开放。</p>
<button class="pill dark" type="button" disabled>下单</button>
</form>
</dialog>`;
}

function articleDetails(item, products) {
  const tags = item.tags.length ? `<ul class="article-tags" aria-label="标签">${item.tags.map(tag => `<li>${escape(tag)}</li>`).join('')}</ul>` : '';
  const related = item.related.map(id => products.find(product => product.slug === id)).filter(Boolean);
  const links = related.length ? `<nav class="content-actions" aria-label="相关产品">${related.map(product => `<a class="pill" href="${route('products', product.slug)}">${escape(product.title)}</a>`).join('')}</nav>` : '';
  return `<article>\n<h1>${escape(item.title)}</h1>\n${articleMeta(item)}\n${tags}\n${item.summary ? `<p class="article-intro">${escape(item.summary)}</p>` : ''}\n<div class="content-body">${item.blocks.map(block => bodyBlock(block, item)).join('\n')}</div>\n${links}\n</article>`;
}

function slot(text, name, value, js = false) {
  const open = js ? `  // BEGIN ADMIN: ${name}` : `<!-- BEGIN ADMIN: ${name} -->`;
  const close = js ? `  // END ADMIN: ${name}` : `<!-- END ADMIN: ${name} -->`;
  const start = text.indexOf(open);
  const end = text.indexOf(close);
  if (start < 0 || end <= start) throw new Error(`缺少生成标记 ${name}。`);
  return `${text.slice(0, start + open.length)}\n${value}\n${text.slice(end)}`;
}

function grid(items, render, className, fallback = '') {
  return items.length ? `<div class="${className}">\n${items.map(item => render(item)).join('\n')}\n</div>` : fallback;
}

function filters(items, key, label) {
  const options = ['全部', ...new Set(items.map(item => item[key]))];
  return `<fieldset data-filter="${key}">\n<legend>${label}</legend>\n${options.map((option, index) => `<button type="button" aria-pressed="${index === 0}">${escape(option)}</button>`).join('\n')}\n</fieldset>`;
}

export function detail(shell, collection, item, products) {
  const article = collection === 'articles';
  const section = article ? '研究' : '产品';
  const list = article ? 'research.html' : 'products.html';
  const available = item.status !== 'archived' || item.preview;
  const content = !available ? `<article><h1>${escape(item.title)}</h1><p>这项内容目前未公开。</p></article>` : article ? articleDetails(item, products) : productDetails(item);
  const extraScript = available && !article ? '<script defer src="product.js"></script>\n' : '';
  return shell
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escape(item.title)} · NijiEhon</title>${item.status === 'archived' ? '\n<meta name="robots" content="noindex">' : ''}`)
    .replace('</head>', extraScript + '</head>')
    .replace(/<main>[\s\S]*?<\/main>/, () => `<main>\n${content}\n</main>`)
    .replace(/(<nav class="footer-crumb"[^>]*>.*?)<span aria-current="page">[^<]*<\/span>/, (_, opening) => `${opening}<a href="${list}">${section}</a> / <span aria-current="page">${escape(item.title)}</span>`);
}

export function render(data, read) {
  const productsShell = read('products.html');
  const researchShell = read('research.html');
  const { products, articles, poster } = data;
  const pages = new Map();
  const banner = `<img class="banner" src="${escape(poster.image)}" alt="${escape(poster.alt)}"${poster.position === 'center' ? '' : ` style="object-position:center ${poster.position}"`}>`;
  let home = slot(read('index.html'), 'poster', banner);
  home = slot(home, 'home-products', grid(products.slice(0, 3), productCard, 'grid', '<p>暂无上架产品。</p>'));
  pages.set('index.html', slot(home, 'home-articles', grid(articles.slice(0, 3), articleCard, 'article-list', '<p>暂无已发布文章。</p>')));
  pages.set('products.html', slot(productsShell, 'catalog', [filters(products, 'region', '使用地区'), filters(products, 'category', '产品分类'), grid(products, productCard, 'grid'), `<p id="empty"${products.length ? ' hidden' : ''}>当前组合暂无产品。</p>`].join('\n')));
  pages.set('research.html', slot(researchShell, 'research', `${grid(articles.slice(0, 3), item => articleCard(item, true), 'grid')}\n<section>\n<h2>全部文章</h2>\n${grid(articles, articleCard, 'article-list', '<p>暂无已发布文章。</p>')}\n</section>`));
  for (const collection of collections) {
    for (const item of data[collection]) pages.set(route(collection, item.slug), detail(collection === 'products' ? productsShell : researchShell, collection, item, products));
  }
  for (const name of data.retired) {
    const collection = name.startsWith('product-') ? 'products' : 'articles';
    pages.set(name, detail(collection === 'products' ? productsShell : researchShell, collection, { title: collection === 'products' ? '产品已下架' : '文章已撤下', status: 'archived' }, products));
  }
  const search = collections.toReversed().flatMap(collection => data[collection].map(item => `  ${JSON.stringify([route(collection, item.slug), item.title, collection === 'products' ? '产品' : '指南', [item.keywords, item.summary, item.category, item.region, item.author, ...(item.tags || [])].filter(Boolean).join(' ')])},`));
  pages.set('site.js', slot(read('site.js'), 'search', search.join('\n'), true));
  return pages;
}
