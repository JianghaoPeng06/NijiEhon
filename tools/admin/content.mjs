export const collections = ['products', 'articles'];
const currencies = ['CNY', 'USD', 'GBP', 'EUR', 'HKD', 'JPY'];
export const imagePath = /^assets\/(?:placeholders\/[a-z0-9-]+\.jpg|station\.jpg|content\/[a-f0-9]{64}\.(?:jpg|png|webp))$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const formatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' });

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

export function normalizeRecord(collection, values) {
  const article = collection === 'articles';
  const status = choice(values.status, ['draft', 'published', 'archived'], '状态');
  const record = {
    slug: slug(values.slug), title: field(values.title, '标题', 100, true),
    summary: field(values.summary, '简介', 500, !article && status === 'published'),
    body: field(values.body, '正文', 40000, article && status === 'published'),
    image: image(values.image), imageAlt: field(values.imageAlt, '图片描述', 180),
    keywords: field(values.keywords, '搜索关键词', 200),
    weight: choice(Number(values.weight), [1, 2, 3, 4, 5], '权重'), status
  };
  if (article) {
    const date = values.date ? new Date(values.date) : null;
    if (!Number.isFinite(date?.getTime()) && (values.date || status === 'published')) throw new Error('请输入有效的发布时间。');
    const read = values.read === '' || values.read == null ? null : Number(values.read);
    if (read !== null && (!Number.isInteger(read) || read < 1 || read > 300)) throw new Error('阅读时间须为 1 至 300 分钟，或留空自动估算。');
    return { ...record, author: field(values.author, '作者', 80) || 'NijiEhon', date: date ? date.toISOString() : '', read, pinned: values.pinned === true, related: [...new Set((values.related || []).map(slug))] };
  }

  const region = field(values.region, '地区', 32, status === 'published');
  const category = field(values.category, '分类', 32, status === 'published');
  if (region === '全部' || category === '全部') throw new Error('「全部」保留给筛选按钮，请填写具体地区或分类。');
  const url = field(values.url, '官方网站', 2000);
  if (url) {
    const parsed = URL.parse(url);
    if (parsed?.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('官方网站需要使用有效的 HTTPS 链接。');
  }
  const currency = choice(values.currency || 'CNY', currencies, '币种');
  const priceMode = choice(values.priceMode || 'hidden', ['hidden', 'fixed', 'from'], '价格类型');
  const price = priceMode === 'hidden' ? '' : field(values.price, '价格', 13, true);
  const amountPattern = currency === 'JPY' ? /^\d{1,10}$/ : /^\d{1,10}(?:\.\d{1,2})?$/;
  if (price && !amountPattern.test(price)) throw new Error(currency === 'JPY' ? '日元价格须为非负整数，最多 10 位。' : '价格须为非负金额，整数最多 10 位，小数最多两位。');
  const unit = price ? field(values.unit, '计价单位', 16) : '';
  return { ...record, region, category, url, currency, priceMode, price, unit };
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
  const han = item.body.match(/\p{Script=Han}/gu) || [];
  const words = item.body.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+/gu) || [];
  const minutes = item.read ?? Math.max(1, Math.ceil(han.length / 350 + words.length / 220));
  return `<span class="article-meta">${pinned && item.pinned ? '置顶 · ' : ''}${display}${escape(item.author)} · 约 ${minutes} 分钟阅读</span>`;
}

function imageTag(item, css) {
  if (!item.image) return '';
  return `<img class="${css}" src="${escape(item.image)}" alt="${escape(item.imageAlt)}" loading="lazy" decoding="async">`;
}

function displayPrice(item) {
  if (item.priceMode === 'hidden') return '价格待公布';
  const amount = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: item.currency, currencyDisplay: 'code' }).format(Number(item.price));
  return `${amount}${item.priceMode === 'from' ? ' 起' : ''}${item.unit ? ` / ${escape(item.unit)}` : ''}`;
}

function productCard(item) {
  return `<a class="tile" href="${route('products', item.slug)}" data-region="${escape(item.region)}" data-category="${escape(item.category)}">\n${imageTag(item, 'cover')}<span>${escape(item.title)}${item.priceMode === 'hidden' ? '' : `<small class="article-meta">${displayPrice(item)}</small>`}</span></a>`;
}

function articleCard(item, featured = false) {
  return `<a${featured ? ' class="tile"' : ''} href="${route('articles', item.slug)}">\n${imageTag(item, featured ? 'cover' : 'mini') || (featured ? '' : '<span class="mini content-placeholder" aria-hidden="true"></span>')}\n<div><span class="article-title">${escape(item.title)}</span>${articleMeta(item, true)}</div>\n</a>`;
}

function body(text) {
  return text.split(/\r?\n\s*\r?\n/).filter(Boolean).map(block => {
    const lines = block.split(/\r?\n/);
    if (lines.length === 1 && /^#{1,3} /.test(block)) return `<h2>${escape(block.replace(/^#{1,3} /, ''))}</h2>`;
    if (lines.every(line => /^[-*] /.test(line))) return `<ul>${lines.map(line => `<li>${escape(line.slice(2))}</li>`).join('')}</ul>`;
    if (lines.every(line => line.startsWith('> '))) return `<blockquote><p>${lines.map(line => escape(line.slice(2))).join('<br>')}</p></blockquote>`;
    return `<p>${lines.map(escape).join('<br>')}</p>`;
  }).join('\n');
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
  let content = '<p>这项内容目前未公开。</p>';
  if (item.status !== 'archived' || item.preview) {
    const related = article ? item.related.map(id => products.find(product => product.slug === id)).filter(Boolean) : [];
    const actions = article ? related.length && `<nav class="content-actions" aria-label="相关产品">${related.map(product => `<a class="pill" href="${route('products', product.slug)}">${escape(product.title)}</a>`).join('')}</nav>` :
      `<p class="content-price">${displayPrice(item)}</p><div class="content-actions"><button class="pill dark" type="button" disabled>购买（暂未开放）</button>${item.url ? `<a class="pill" href="${escape(item.url)}">前往官方网站</a>` : ''}</div>`;
    content = `${article ? articleMeta(item) : `<p class="article-meta">${[item.region, item.category].filter(Boolean).map(escape).join(' · ')}</p>`}\n${item.summary ? `<p>${escape(item.summary)}</p>` : ''}\n${imageTag(item, 'content-cover')}\n<div class="content-body">${body(item.body)}</div>\n${actions || ''}`;
  }
  return shell
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escape(item.title)} · NijiEhon</title>${item.status === 'archived' ? '\n<meta name="robots" content="noindex">' : ''}`)
    .replace(/<main>[\s\S]*?<\/main>/, () => `<main>\n<article>\n<h1>${escape(item.title)}</h1>\n${content}\n</article>\n</main>`)
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
  const search = collections.toReversed().flatMap(collection => data[collection].map(item => `  ${JSON.stringify([route(collection, item.slug), item.title, collection === 'products' ? '产品' : '指南', [item.keywords, item.summary, item.category, item.region, item.author].filter(Boolean).join(' ')])},`));
  pages.set('site.js', slot(read('site.js'), 'search', search.join('\n'), true));
  return pages;
}
